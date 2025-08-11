const { ProductComment } = require('../Models');

class CommentService {
  async getAllComments() {
    return await ProductComment.find().sort({ date: -1 });
  }

  async getCommentsByProductId(productId) {
    return await ProductComment.find({ clefProduct: productId }).sort({ date: -1 });
  }

  async createComment(commentData) {
    const newComment = new ProductComment(commentData);
    return await newComment.save();
  }

  async updateComment(commentId, commentData) {
    return await ProductComment.findByIdAndUpdate(
      commentId,
      commentData,
      { new: true, runValidators: true }
    );
  }

  async deleteComment(commentId) {
    const deleted = await ProductComment.findByIdAndDelete(commentId);
    return !!deleted;
  }

  async getCommentById(commentId) {
    return await ProductComment.findById(commentId);
  }

  async getCommentsByUser(userId) {
    return await ProductComment.find({ clefUser: userId }).sort({ date: -1 });
  }

  async getAverageRating(productId) {
    const result = await ProductComment.aggregate([
      { $match: { clefProduct: productId } },
      { $group: { _id: null, averageRating: { $avg: "$etoil" }, count: { $sum: 1 } } }
    ]);
    
    return result.length > 0 ? result[0] : { averageRating: 0, count: 0 };
  }
}

module.exports = new CommentService();