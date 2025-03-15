class MessageEncryption {
  constructor() {
    this.CryptoJS = null;
    this.encryptionKey = null;
  }
  
  async init() {
    try {
      // Try to load CryptoJS dynamically
      this.CryptoJS = await import('crypto-js');
      
      // Generate or load encryption key
      this.loadOrGenerateKey();
      
      console.log('Encryption initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      return false;
    }
  }
  
  loadOrGenerateKey() {
    // Try to load existing key from local storage
    const savedKey = localStorage.getItem('safespacesocial_encryption_key');
    if (savedKey) {
      this.encryptionKey = savedKey;
    } else {
      // Generate a new key
      this.encryptionKey = this.generateRandomKey(32);
      // Save it to local storage
      localStorage.setItem('safespacesocial_encryption_key', this.encryptionKey);
    }
  }
  
  generateRandomKey(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < length; i++) {
      key += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return key;
  }
  
  encryptMessage(message) {
    if (!this.CryptoJS || !this.encryptionKey) {
      console.warn('Encryption not initialized');
      return message;
    }
    
    try {
      // Stringify the message if it's an object
      const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
      
      // Encrypt the message
      const encrypted = this.CryptoJS.AES.encrypt(messageStr, this.encryptionKey).toString();
      
      return {
        data: encrypted,
        encrypted: true
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      return message;
    }
  }
  
  decryptMessage(message) {
    if (!this.CryptoJS || !this.encryptionKey) {
      console.warn('Encryption not initialized');
      return message;
    }
    
    try {
      // If the message is not encrypted, return it as is
      if (!message.encrypted) {
        return message;
      }
      
      // Decrypt the message
      const decrypted = this.CryptoJS.AES.decrypt(message.data, this.encryptionKey).toString(this.CryptoJS.enc.Utf8);
      
      // Parse the decrypted message if it's a JSON string
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error('Decryption failed:', error);
      return message;
    }
  }
}

