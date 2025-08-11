const { User } = require('./src/Models');
const db = require('./src/dbs');

async function checkUsers() {
  try {
    const users = await User.find().limit(10);
    console.log('Premiers 10 utilisateurs:');
    users.forEach(user => {
      console.log(`Email: ${user.email}, Phone: ${user.phoneNumber}`);
    });
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
