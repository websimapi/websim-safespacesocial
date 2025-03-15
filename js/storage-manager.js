class StorageManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.localPosts = [];
    this.websimPosts = [];
  }
  
  async init() {
    try {
      // Load posts from local storage
      const savedPosts = localStorage.getItem('safespacesocial_posts');
      if (savedPosts) {
        this.localPosts = JSON.parse(savedPosts);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      return false;
    }
  }
  
  saveLocalPosts() {
    try {
      localStorage.setItem('safespacesocial_posts', JSON.stringify(this.localPosts));
    } catch (error) {
      console.error('Failed to save posts to local storage:', error);
    }
  }
  
  addPost(post) {
    // Check if the post already exists
    if (!this.localPosts.some(p => p.id === post.id)) {
      this.localPosts.push(post);
      this.saveLocalPosts();
      return true;
    }
    return false;
  }
  
  removePost(postId) {
    const index = this.localPosts.findIndex(p => p.id === postId);
    if (index !== -1) {
      this.localPosts.splice(index, 1);
      this.saveLocalPosts();
      return true;
    }
    return false;
  }
  
  setWebsimPosts(posts) {
    this.websimPosts = posts;
  }
  
  getPosts() {
    // If we're connected to a node, prioritize local posts
    if (this.connectionManager.isConnectedToAnyNode()) {
      return [...this.localPosts];
    } else {
      // Otherwise merge websim posts with local posts
      const allPosts = [...this.websimPosts];
      
      // Add local posts that don't exist in websim posts
      for (const localPost of this.localPosts) {
        if (!allPosts.some(p => p.id === localPost.id)) {
          allPosts.push(localPost);
        }
      }
      
      // Sort by timestamp
      return allPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
  }
  
  clearAllPosts() {
    this.localPosts = [];
    this.saveLocalPosts();
  }
}

