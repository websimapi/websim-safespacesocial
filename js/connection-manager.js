class ConnectionManager {
  constructor() {
    this.room = null;
    this.p2pManager = new P2PManager(this);
    this.encryptionManager = null;
    this.storageManager = null;
    this.isUsingP2P = false;
    this.nodeStatuses = {};
    this.knownNodes = [];
    this.clientId = this.generateClientId();
    this.onPostUpdate = null;
    this.onPeerUpdate = null;
    this.onNodeStatusChange = null;
  }

  async init() {
    // Initialize the WebsimSocket connection
    this.room = new WebsimSocket();
    
    // Initialize the encryption manager
    this.encryptionManager = new MessageEncryption();
    await this.encryptionManager.init();
    
    // Initialize the storage manager
    this.storageManager = new StorageManager(this);
    await this.storageManager.init();
    
    // Try to initialize P2P functionality
    const p2pInitialized = await this.p2pManager.init();
    
    // Setup Websim event handlers
    this.setupWebsimHandlers();
    
    // Load known nodes
    await this.loadKnownNodes();
    
    // If P2P is initialized, try to connect to known nodes
    if (p2pInitialized && this.knownNodes.length > 0) {
      this.connectToNodes();
    }
    
    // Setup P2P event handlers if available
    if (p2pInitialized) {
      this.setupP2PHandlers();
    }
    
    return true;
  }
  
  generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
  }
  
  setupWebsimHandlers() {
    // Handle Websim messages
    this.room.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "connected":
          console.log(`WebSim: Connected ${data.clientId}, ${data.username}`);
          break;
        case "disconnected":
          console.log(`WebSim: Disconnected ${data.clientId}, ${data.username}`);
          break;
        default:
          // Handle custom messages
          console.log("WebSim: Received event:", data);
      }
    };
    
    // Subscribe to posts collection
    this.room.collection('post').subscribe((posts) => {
      if (this.onPostUpdate) {
        this.onPostUpdate(posts);
      }
    });
    
    // Subscribe to peers
    this.room.party.subscribe((peers) => {
      if (this.onPeerUpdate) {
        this.onPeerUpdate(peers);
      }
    });
  }
  
  setupP2PHandlers() {
    // Handle P2P messages
    this.p2pManager.onPeerMessage = (peerId, message) => {
      switch (message.type) {
        case 'post':
          this.handleP2PPost(message.data);
          break;
        case 'requestPosts':
          this.sendPostsToPeer(peerId);
          break;
        case 'knownNodes':
          this.handleKnownNodesFromPeer(message.nodes);
          break;
      }
    };
    
    // Handle peer connections
    this.p2pManager.onPeerConnect = (peerId) => {
      // Send a request for posts when a new peer connects
      this.p2pManager.sendToPeer(peerId, {
        type: 'requestPosts'
      });
      
      // Share known nodes
      this.p2pManager.sendToPeer(peerId, {
        type: 'knownNodes',
        nodes: this.knownNodes
      });
      
      if (this.onPeerUpdate) {
        this.onPeerUpdate(this.getAllPeers());
      }
    };
    
    // Handle peer disconnections
    this.p2pManager.onPeerDisconnect = (peerId) => {
      if (this.onPeerUpdate) {
        this.onPeerUpdate(this.getAllPeers());
      }
    };
  }
  
  async loadKnownNodes() {
    try {
      // Try to load nodes from localStorage
      const savedNodes = localStorage.getItem('safespacesocial_nodes');
      if (savedNodes) {
        this.knownNodes = JSON.parse(savedNodes);
      }
      
      // Add default nodes if available
      if (window.defaultNodes && Array.isArray(window.defaultNodes)) {
        for (const node of window.defaultNodes) {
          if (!this.knownNodes.some(n => n.id === node.id)) {
            this.knownNodes.push(node);
          }
        }
      }
      
      console.log('Loaded known nodes:', this.knownNodes);
    } catch (error) {
      console.error('Failed to load known nodes:', error);
      this.knownNodes = [];
    }
  }
  
  saveKnownNodes() {
    try {
      localStorage.setItem('safespacesocial_nodes', JSON.stringify(this.knownNodes));
    } catch (error) {
      console.error('Failed to save known nodes:', error);
    }
  }
  
  async connectToNodes() {
    for (const node of this.knownNodes) {
      this.updateNodeStatus(node.id, 'connecting');
      const connected = await this.p2pManager.connectToNode(node);
      if (!connected) {
        this.updateNodeStatus(node.id, 'disconnected');
      }
    }
  }
  
  updateNodeStatus(nodeId, status) {
    this.nodeStatuses[nodeId] = status;
    if (this.onNodeStatusChange) {
      this.onNodeStatusChange(nodeId, status);
    }
  }
  
  async addNode(nodeInfo) {
    if (!this.knownNodes.some(n => n.id === nodeInfo.id)) {
      this.knownNodes.push(nodeInfo);
      this.saveKnownNodes();
      
      this.updateNodeStatus(nodeInfo.id, 'connecting');
      const connected = await this.p2pManager.connectToNode(nodeInfo);
      if (!connected) {
        this.updateNodeStatus(nodeInfo.id, 'disconnected');
      }
      
      return true;
    }
    return false;
  }
  
  removeNode(nodeId) {
    const index = this.knownNodes.findIndex(n => n.id === nodeId);
    if (index !== -1) {
      this.knownNodes.splice(index, 1);
      this.saveKnownNodes();
      
      if (this.p2pManager.nodeConnections[nodeId]) {
        if (this.p2pManager.nodeConnections[nodeId].readyState === WebSocket.OPEN) {
          this.p2pManager.nodeConnections[nodeId].close();
        }
        delete this.p2pManager.nodeConnections[nodeId];
      }
      
      delete this.nodeStatuses[nodeId];
      if (this.onNodeStatusChange) {
        this.onNodeStatusChange(nodeId, null);
      }
      
      return true;
    }
    return false;
  }
  
  handleP2PPost(postData) {
    // Verify and decrypt the post if needed
    const post = this.encryptionManager.decryptMessage(postData);
    
    // Store the post in local storage
    this.storageManager.addPost(post);
    
    // Update UI
    if (this.onPostUpdate) {
      this.onPostUpdate(this.storageManager.getPosts());
    }
  }
  
  sendPostsToPeer(peerId) {
    const posts = this.storageManager.getPosts();
    for (const post of posts) {
      const encryptedPost = this.encryptionManager.encryptMessage(post);
      this.p2pManager.sendToPeer(peerId, {
        type: 'post',
        data: encryptedPost
      });
    }
  }
  
  handleKnownNodesFromPeer(nodes) {
    let updated = false;
    
    for (const node of nodes) {
      if (!this.knownNodes.some(n => n.id === node.id)) {
        this.knownNodes.push(node);
        updated = true;
      }
    }
    
    if (updated) {
      this.saveKnownNodes();
      // Try to connect to newly discovered nodes
      this.connectToNodes();
    }
  }
  
  getAllPeers() {
    // Combine WebSim peers and P2P peers
    const peers = {...this.room.party.peers};
    
    // Add P2P peers that aren't in WebSim
    const p2pPeers = this.p2pManager.getAllConnectedPeers();
    for (const peerId of p2pPeers) {
      if (!peers[peerId]) {
        peers[peerId] = {
          id: peerId,
          username: `Peer-${peerId.substring(0, 6)}`,
          isP2P: true
        };
      }
    }
    
    return peers;
  }
  
  async createPost(content) {
    try {
      // Create a post in WebSim
      const post = await this.room.collection('post').create({
        content: content,
        timestamp: new Date().toISOString()
      });
      
      // If using P2P, also broadcast to peers
      if (Object.keys(this.p2pManager.peers).length > 0) {
        const encryptedPost = this.encryptionManager.encryptMessage({
          id: post.id,
          content: content,
          username: this.room.party.client.username || 'Anonymous',
          timestamp: new Date().toISOString()
        });
        
        this.p2pManager.broadcastToPeers({
          type: 'post',
          data: encryptedPost
        });
      }
      
      return post;
    } catch (error) {
      console.error('Failed to create post:', error);
      
      // If WebSim fails, still try to store locally and broadcast via P2P
      const postId = 'local_' + Date.now();
      const newPost = {
        id: postId,
        content: content,
        username: this.room.party.client.username || 'Anonymous',
        timestamp: new Date().toISOString()
      };
      
      this.storageManager.addPost(newPost);
      
      if (Object.keys(this.p2pManager.peers).length > 0) {
        const encryptedPost = this.encryptionManager.encryptMessage(newPost);
        this.p2pManager.broadcastToPeers({
          type: 'post',
          data: encryptedPost
        });
      }
      
      if (this.onPostUpdate) {
        this.onPostUpdate(this.storageManager.getPosts());
      }
      
      return newPost;
    }
  }
  
  isConnectedToAnyNode() {
    return Object.values(this.nodeStatuses).some(status => status === 'connected');
  }
  
  prepareNodeFilesForDownload() {
    // Create a zip of the node server files
    const filesContent = {
      'server.js': NODE_SERVER_CODE,
      'package.json': NODE_PACKAGE_JSON,
      'README.md': NODE_README
    };
    
    return filesContent;
  }
}

// Node server code
const NODE_SERVER_CODE = `const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const NODE_ID = 'node_' + Math.random().toString(36).substr(2, 9);

// Store connected clients
const clients = new Map();

// Store node info
const nodeInfo = {
  id: NODE_ID,
  wsUrl: \`ws://localhost:\${PORT}\`,
  httpUrl: \`http://localhost:\${PORT}\`,
  name: 'SafeSpace Node'
};

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    nodeInfo
  });
});

app.get('/info', (req, res) => {
  res.json({
    id: nodeInfo.id,
    wsUrl: nodeInfo.wsUrl,
    httpUrl: nodeInfo.httpUrl,
    name: nodeInfo.name,
    clients: Array.from(clients.keys())
  });
});

wss.on('connection', (ws) => {
  let clientId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      switch (data.type) {
        case 'getPeers':
          clientId = data.clientId;
          clients.set(clientId, ws);
          
          // Send list of other connected peers to the new client
          ws.send(JSON.stringify({
            type: 'peersList',
            peers: Array.from(clients.keys()).filter(id => id !== clientId)
          }));
          
          // Notify other clients about the new peer
          for (const [id, client] of clients.entries()) {
            if (id !== clientId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'newPeer',
                peerId: clientId
              }));
            }
          }
          break;
          
        case 'signal':
          // Forward signaling data to the target peer
          const targetClient = clients.get(data.to);
          if (targetClient && targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(JSON.stringify({
              type: 'signal',
              from: data.from,
              signal: data.signal
            }));
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
      
      // Notify other clients about the disconnected peer
      for (const [id, client] of clients.entries()) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'peerDisconnected',
            peerId: clientId
          }));
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(\`SafeSpace Node server running on port \${PORT}\`);
  console.log(\`Node ID: \${NODE_ID}\`);
  console.log(\`WebSocket URL: ws://localhost:\${PORT}\`);
  console.log(\`HTTP URL: http://localhost:\${PORT}\`);
});`;

// Package.json for the node server
const NODE_PACKAGE_JSON = `{
  "name": "safespace-node",
  "version": "1.0.0",
  "description": "Node server for SafeSpaceSocial P2P network",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.17.3",
    "ws": "^8.5.0"
  }
}`;

// README for the node server
const NODE_README = `# SafeSpaceSocial Node Server

This is a node server for the SafeSpaceSocial P2P network. It helps peers discover each other and establish direct connections.

## Setup

1. Install Node.js if you don't have it already.
2. Run \`npm install\` to install dependencies.
3. Run \`npm start\` to start the server.

By default, the server runs on port 3000. You can change this by setting the PORT environment variable.

## Connecting your SafeSpaceSocial app to your node

Once your node is running, you can add it to your SafeSpaceSocial app by entering your node information in the "Add Node" form.

Node ID: The ID shown in the console when you start the server
Node URL: ws://localhost:3000 (or the URL where your server is hosted)
Node Name: Any name you want to give to your node

## Making your node public

If you want other users to connect to your node, you'll need to make it accessible from the internet. You can use a service like ngrok or deploy it to a cloud provider.

### Using ngrok to expose your local node:

1. Install ngrok: https://ngrok.com/download
2. Run: \`ngrok http 3000\`
3. Use the HTTPS URL provided by ngrok when adding your node to SafeSpaceSocial.

Note: The URL will change each time you restart ngrok unless you have a paid account.
`;

