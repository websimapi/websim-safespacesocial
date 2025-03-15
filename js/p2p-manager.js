class P2PManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.peers = {};
    this.peerIds = new Set();
    this.nodeConnections = {};
    this.onPeerMessage = null;
    this.onPeerConnect = null;
    this.onPeerDisconnect = null;
  }

  async init() {
    try {
      // Try to load SimplePeer dynamically
      this.SimplePeer = await import('simple-peer');
      console.log('SimplePeer loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load SimplePeer:', error);
      return false;
    }
  }

  async connectToNode(nodeInfo) {
    if (!this.SimplePeer) {
      console.error('SimplePeer not loaded');
      return false;
    }
    
    // Check if the node has a dead signal
    if (this.connectionManager.checkForDeadSignal(nodeInfo.id)) {
      console.log(`Not connecting to node ${nodeInfo.id} because it has a dead signal`);
      this.connectionManager.updateNodeStatus(nodeInfo.id, 'dead');
      return false;
    }
    
    try {
      // Create a connection to the node
      const nodeConnection = new WebSocket(nodeInfo.wsUrl);
      
      nodeConnection.onopen = () => {
        console.log(`Connected to node: ${nodeInfo.id}`);
        this.nodeConnections[nodeInfo.id] = nodeConnection;
        this.connectionManager.updateNodeStatus(nodeInfo.id, 'connected');
        
        // Request peer list from node
        nodeConnection.send(JSON.stringify({
          type: 'getPeers',
          clientId: this.connectionManager.clientId
        }));
      };
      
      nodeConnection.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'peersList':
            await this.handlePeersList(message.peers, nodeInfo.id);
            break;
          case 'signal':
            await this.handleSignalMessage(message);
            break;
          case 'newPeer':
            await this.initiatePeerConnection(message.peerId, true, nodeInfo.id);
            break;
          case 'deadSignal':
            // Handle dead signal from node
            if (this.connectionManager.verifyDeadSignal(message.signal)) {
              await this.handleNodeDeadSignal(message.signal);
            }
            break;
        }
      };
      
      nodeConnection.onclose = () => {
        console.log(`Disconnected from node: ${nodeInfo.id}`);
        delete this.nodeConnections[nodeInfo.id];
        this.connectionManager.updateNodeStatus(nodeInfo.id, 'disconnected');
      };
      
      nodeConnection.onerror = (error) => {
        console.error(`Node connection error: ${nodeInfo.id}`, error);
        this.connectionManager.updateNodeStatus(nodeInfo.id, 'disconnected');
      };
      
      return true;
    } catch (error) {
      console.error(`Failed to connect to node: ${nodeInfo.id}`, error);
      return false;
    }
  }
  
  async handlePeersList(peers, nodeId) {
    console.log(`Received peers list from node ${nodeId}:`, peers);
    
    for (const peerId of peers) {
      if (peerId !== this.connectionManager.clientId && !this.peerIds.has(peerId)) {
        await this.initiatePeerConnection(peerId, false, nodeId);
      }
    }
  }
  
  async initiatePeerConnection(peerId, initiator, nodeId) {
    if (this.peerIds.has(peerId)) return;
    
    this.peerIds.add(peerId);
    
    const peer = new this.SimplePeer.default({
      initiator,
      trickle: true
    });
    
    this.peers[peerId] = peer;
    
    peer.on('signal', data => {
      // Send signal data through the node
      if (this.nodeConnections[nodeId]) {
        this.nodeConnections[nodeId].send(JSON.stringify({
          type: 'signal',
          to: peerId,
          from: this.connectionManager.clientId,
          signal: data
        }));
      }
    });
    
    peer.on('connect', () => {
      console.log(`Connected to peer: ${peerId}`);
      if (this.onPeerConnect) {
        this.onPeerConnect(peerId);
      }
    });
    
    peer.on('data', data => {
      const message = JSON.parse(data.toString());
      if (this.onPeerMessage) {
        this.onPeerMessage(peerId, message);
      }
    });
    
    peer.on('close', () => {
      console.log(`Disconnected from peer: ${peerId}`);
      this.removePeer(peerId);
      if (this.onPeerDisconnect) {
        this.onPeerDisconnect(peerId);
      }
    });
    
    peer.on('error', err => {
      console.error(`Peer connection error: ${peerId}`, err);
      this.removePeer(peerId);
    });
  }
  
  handleSignalMessage(message) {
    const { from, signal } = message;
    
    if (!this.peers[from]) {
      // If we don't have this peer yet, create a new connection
      this.initiatePeerConnection(from, false, Object.keys(this.nodeConnections)[0]);
    }
    
    if (this.peers[from]) {
      this.peers[from].signal(signal);
    }
  }
  
  sendToPeer(peerId, message) {
    if (this.peers[peerId]) {
      this.peers[peerId].send(JSON.stringify(message));
    }
  }
  
  broadcastToPeers(message) {
    for (const peerId in this.peers) {
      this.sendToPeer(peerId, message);
    }
  }
  
  removePeer(peerId) {
    if (this.peers[peerId]) {
      this.peers[peerId].destroy();
      delete this.peers[peerId];
      this.peerIds.delete(peerId);
    }
  }
  
  getAllConnectedPeers() {
    return Object.keys(this.peers);
  }
  
  disconnectFromAllPeers() {
    for (const peerId in this.peers) {
      this.removePeer(peerId);
    }
  }
  
  disconnectFromAllNodes() {
    for (const nodeId in this.nodeConnections) {
      if (this.nodeConnections[nodeId].readyState === WebSocket.OPEN) {
        this.nodeConnections[nodeId].close();
      }
    }
    this.nodeConnections = {};
  }

  async handleNodeDeadSignal(signal) {
    // Store the dead signal in WebSim database
    try {
      await this.connectionManager.room.collection('nodeDeadSignal').create({
        nodeId: signal.nodeId,
        verificationHash: signal.verificationHash,
        startTime: signal.startTime,
        endTime: signal.endTime,
        permanent: signal.permanent || false,
        message: signal.message || 'Node is offline'
      });
      
      // Update node status
      this.connectionManager.updateNodeStatus(signal.nodeId, 'dead');
      
      // Close connection if open
      if (this.nodeConnections[signal.nodeId]) {
        this.nodeConnections[signal.nodeId].close();
        delete this.nodeConnections[signal.nodeId];
      }
    } catch (error) {
      console.error('Failed to store dead signal:', error);
    }
  }
}