const Zone = require('../models/Zone');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');

class ImportService {
  constructor() {
    this.typeMapping = {
      0: 'country',
      1: 'region', 
      2: 'city',
      3: 'district'
    };
  }

  // Parser un fichier CSV ou Excel
  async parseFile(filePath, fileType) {
    try {
      let data = [];
      
      if (fileType === 'csv') {
        data = await this.parseCSV(filePath);
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        data = this.parseExcel(filePath);
      } else {
        throw new Error('Format de fichier non supporté. Utilisez CSV ou Excel.');
      }

      return this.validateImportData(data);
    } catch (error) {
      throw new Error(`Erreur lors du parsing du fichier: ${error.message}`);
    }
  }

  // Parser fichier CSV
  parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Convertir les clés en format standard
          const standardRow = this.standardizeRow(row);
          if (this.isValidRow(standardRow)) {
            results.push(standardRow);
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  // Parser fichier Excel
  parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length < 2) {
      throw new Error('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données');
    }

    const headers = jsonData[0];
    const results = [];

    for (let i = 1; i < jsonData.length; i++) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = jsonData[i][index] || '';
      });
      
      const standardRow = this.standardizeRow(row);
      if (this.isValidRow(standardRow)) {
        results.push(standardRow);
      }
    }

    return results;
  }

  // Standardiser les noms de colonnes
  standardizeRow(row) {
    const standardized = {};
    const keys = Object.keys(row);
    
    // Mapping des colonnes possibles
    const columnMapping = {
      'pays': 'country',
      'country': 'country',
      'région': 'region',
      'region': 'region',
      'état': 'region',
      'state': 'region',
      'ville': 'city',
      'city': 'city',
      'quartier': 'district',
      'district': 'district',
      'commune': 'district',
      'arrondissement': 'district'
    };

    keys.forEach(key => {
      const normalizedKey = key.toLowerCase().trim();
      const mappedKey = columnMapping[normalizedKey] || normalizedKey;
      // Normaliser la casse pour éviter les doublons comme "Bobo-Dioulasso" vs "Bobo-dioulasso"
      const normalizedValue = (row[key] || '').toString().trim();
      standardized[mappedKey] = normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1).toLowerCase();
    });

    return standardized;
  }

  // Vérifier si une ligne est valide
  isValidRow(row) {
    return row.country && row.country.length > 0;
  }

  // Valider les données d'import
  validateImportData(data) {
    const validatedData = [];
    const errors = [];

    data.forEach((row, index) => {
      const lineNumber = index + 2; // +2 car ligne 1 = headers, index 0 = ligne 2
      
      try {
        if (!row.country) {
          errors.push(`Ligne ${lineNumber}: Le pays est requis`);
          return;
        }

        // Construire la hiérarchie
        const hierarchy = [row.country];
        if (row.region) hierarchy.push(row.region);
        if (row.city) hierarchy.push(row.city);
        if (row.district) hierarchy.push(row.district);

        validatedData.push({
          hierarchy,
          originalRow: row,
          lineNumber
        });
      } catch (error) {
        errors.push(`Ligne ${lineNumber}: ${error.message}`);
      }
    });

    return { validatedData, errors };
  }

  // CORRECTION PRINCIPALE : Générer un code unique avec contrôle strict de la longueur
  async generateUniqueCode(name, parentCode = null, level = 0) {
    const MAX_CODE_LENGTH = 20;
    
    // Créer des abréviations intelligentes
    let cleanName = this.createAbbreviation(name, level);
    
    let baseCode;
    if (parentCode) {
      // Calculer l'espace disponible pour le nouveau segment
      const separatorLength = 1; // pour le tiret
      const minSuffixSpace = 2; // espace minimum pour le suffixe numérique (-1)
      const availableLength = MAX_CODE_LENGTH - parentCode.length - separatorLength - minSuffixSpace;
      
      if (availableLength < 1) {
        // Si vraiment plus d'espace, utiliser juste un numéro
        cleanName = level.toString();
      } else {
        // Tronquer le nom nettoyé si nécessaire
        cleanName = cleanName.substring(0, Math.max(1, availableLength));
      }
      
      baseCode = `${parentCode}-${cleanName}`;
    } else {
      // Pour le niveau racine, réserver de l'espace pour les niveaux futurs
      const reservedSpace = 3; // espace pour suffixe numérique
      baseCode = cleanName.substring(0, MAX_CODE_LENGTH - reservedSpace);
    }

    // S'assurer que le code de base ne dépasse jamais la limite
    if (baseCode.length >= MAX_CODE_LENGTH) {
      baseCode = baseCode.substring(0, MAX_CODE_LENGTH - 2); // -2 pour le suffixe minimum
    }

    // Vérifier l'unicité et ajouter un suffixe si nécessaire
    let counter = 1;
    let finalCode = baseCode;
    
    while (await Zone.findOne({ code: finalCode })) {
      const suffix = `-${counter}`;
      const maxBaseLength = MAX_CODE_LENGTH - suffix.length;
      
      if (baseCode.length > maxBaseLength) {
        const truncatedBase = baseCode.substring(0, maxBaseLength);
        finalCode = `${truncatedBase}${suffix}`;
      } else {
        finalCode = `${baseCode}${suffix}`;
      }
      
      // Sécurité supplémentaire
      if (finalCode.length > MAX_CODE_LENGTH) {
        finalCode = finalCode.substring(0, MAX_CODE_LENGTH);
      }
      
      counter++;
    }

    return finalCode;
  }

  // Créer une abréviation intelligente basée sur le nom et le niveau
  createAbbreviation(name, level) {
    // Nettoyer le nom
    let cleanName = name
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();

    // Stratégies d'abréviation par niveau avec longueurs adaptatives
    switch (level) {
      case 0: // Country - plus court pour laisser place aux sous-niveaux
        return this.abbreviateCountry(cleanName);
      case 1: // Region - longueur modérée
        return this.abbreviateRegion(cleanName);
      case 2: // City - plus court
        return this.abbreviateCity(cleanName);
      case 3: // District - le plus court
        return this.abbreviateDistrict(cleanName);
      default:
        return cleanName.substring(0, 3);
    }
  }

  // CORRECTION : Abréviations plus courtes pour les pays
  abbreviateCountry(name) {
    const countryAbbreviations = {
      'NIGER': 'NE',
      'NIGERIA': 'NG',
      'FRANCE': 'FR',
      'BURKINA': 'BF',
      'BURKINAFASO': 'BF',
      'MALI': 'ML',
      'SENEGAL': 'SN',
      'COTEDIVOIRE': 'CI',
      'GHANA': 'GH',
      'BENIN': 'BN',
      'TCHAD': 'TD',
      'CAMEROUN': 'CM'
    };
    
    return countryAbbreviations[name] || name.substring(0, 2);
  }

  // CORRECTION : Abréviations plus courtes pour les régions
  abbreviateRegion(name) {
    // Enlever les mots communs et garder les premiers caractères
    const cleanedName = name
      .replace(/REGION|REG|PROVINCE|PROV/g, '')
      .replace(/CENTRE|CENTER/g, 'C')
      .replace(/NORD|NORTH/g, 'N')
      .replace(/SUD|SOUTH/g, 'S')
      .replace(/EST|EAST/g, 'E')
      .replace(/OUEST|WEST/g, 'W');
    
    return cleanedName.substring(0, 4); // Réduit de 6 à 4
  }

  // CORRECTION : Abréviations plus courtes pour les villes
  abbreviateCity(name) {
    const cleanedName = name
      .replace(/COMMUNE|COMM/g, 'C')
      .replace(/VILLE|CITY/g, '')
      .replace(/ARRONDISSEMENT|ARR/g, 'A');
    
    return cleanedName.substring(0, 3); // Réduit de 5 à 3
  }

  // CORRECTION : Abréviations plus courtes pour les districts/quartiers
  abbreviateDistrict(name) {
    const cleanedName = name
      .replace(/QUARTIER|QUAR|DISTRICT|DIST/g, '')
      .replace(/PLATEAU/g, 'PLT')
      .replace(/CENTRE|CENTER/g, 'CTR')
      .replace(/MARCHE|MARKET/g, 'MRC')
      .replace(/ADMINISTRATIF/g, 'ADM')
      .replace(/NOUVEAU|NEW/g, 'NV')
      .replace(/NORD|NORTH/g, 'N')
      .replace(/SUD|SOUTH/g, 'S')
      .replace(/EST|EAST/g, 'E')
      .replace(/OUEST|WEST/g, 'W');
    
    return cleanedName.substring(0, 2); // Réduit de 4 à 2
  }

  // Importer les zones avec logique intelligente
  async importZones(validatedData) {
    const result = {
      total: validatedData.length,
      created: 0,
      duplicates: 0,
      errors: 0,
      details: {
        created: [],
        duplicates: [],
        errors: []
      }
    };

    for (const item of validatedData) {
      try {
        await this.processHierarchy(item.hierarchy, result);
      } catch (error) {
        result.errors++;
        result.details.errors.push({
          line: item.lineNumber,
          error: error.message,
          data: item.originalRow
        });
      }
    }

    return result;
  }

  // Traiter une hiérarchie de zones
  async processHierarchy(hierarchy, result) {
    let parentId = null;
    let parentCode = null;
    let fullPath = '';

    for (let level = 0; level < hierarchy.length; level++) {
      const zoneName = hierarchy[level];
      if (!zoneName) continue;

      const zoneType = this.typeMapping[level];
      fullPath = level === 0 ? zoneName : `${fullPath} > ${zoneName}`;

      // Vérifier si la zone existe déjà
      const existingZone = await Zone.findOne({
        name: zoneName,
        type: zoneType,
        parent: parentId,
        level: level
      });

      if (existingZone) {
        // Zone existe déjà
        if (level === hierarchy.length - 1) {
          // C'est la dernière zone de la hiérarchie, compter comme doublon
          result.duplicates++;
          result.details.duplicates.push(fullPath);
        }
        parentId = existingZone._id;
        parentCode = existingZone.code;
      } else {
        // Générer un code unique pour la nouvelle zone
        const uniqueCode = await this.generateUniqueCode(zoneName, parentCode, level);

        // VALIDATION SUPPLÉMENTAIRE avant sauvegarde
        if (uniqueCode.length > 20) {
          throw new Error(`Code généré trop long (${uniqueCode.length} caractères): ${uniqueCode}`);
        }

        // Créer la nouvelle zone
        const newZone = new Zone({
          name: zoneName,
          code: uniqueCode,
          type: zoneType,
          parent: parentId,
          level: level,
          isActive: true
        });

        await newZone.save();
        
        result.created++;
        result.details.created.push(`${fullPath} (${uniqueCode})`);
        
        parentId = newZone._id;
        parentCode = uniqueCode;
      }
    }
  }

  // Générer un rapport d'import
  generateImportReport(result) {
    const report = {
      summary: {
        total: result.total,
        created: result.created,
        duplicates: result.duplicates,
        errors: result.errors,
        successRate: result.total > 0 ? ((result.created / result.total) * 100).toFixed(2) : 0
      },
      details: result.details,
      timestamp: new Date().toISOString()
    };

    return report;
  }

  // Valider un fichier avant import
  async validateFile(filePath, fileType) {
    try {
      const { validatedData, errors } = await this.parseFile(filePath, fileType);
      
      return {
        isValid: errors.length === 0,
        rowCount: validatedData.length,
        errors,
        preview: validatedData.slice(0, 5) // Aperçu des 5 premières lignes
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message],
        rowCount: 0,
        preview: []
      };
    }
  }
}

module.exports = new ImportService();