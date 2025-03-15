const { useState, useEffect, useRef, useSyncExternalStore } = React;

function App() {
  const [connectionManager, setConnectionManager] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [posts, setPosts] = useState([]);
  const [peers, setPeers] = useState({});
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [websimStatus, setWebsimStatus] = useState('disconnected');
  const [databaseStatus, setDatabaseStatus] = useState('disconnected');
  const [newPostContent, setNewPostContent] = useState('');
  const [newNodeInfo, setNewNodeInfo] = useState({ id: '', wsUrl: '', name: '' });
  const [addingNode, setAddingNode] = useState(false);
  const [deadNodes, setDeadNodes] = useState({});

  // Initialize the connection manager
  useEffect(() => {
    const init = async () => {
      const manager = new ConnectionManager();
      await manager.init();
      setConnectionManager(manager);
      
      // Setup callback handlers
      manager.onPostUpdate = (updatedPosts) => {
        setPosts(updatedPosts);
      };
      
      manager.onPeerUpdate = (updatedPeers) => {
        setPeers(updatedPeers);
      };
      
      manager.onNodeStatusChange = (nodeId, status) => {
        setNodeStatuses(prevStatuses => ({
          ...prevStatuses,
          [nodeId]: status
        }));
      };
      
      // Set initial node statuses
      setNodeStatuses(manager.nodeStatuses);
      setWebsimStatus(manager.websimConnectionStatus);
      setDatabaseStatus(manager.databaseConnectionStatus);
      
      setInitialized(true);
    };
    
    init();
  }, []);
  
  // Subscribe to WebSim posts
  useEffect(() => {
    if (connectionManager && connectionManager.room) {
      // Get initial posts from WebSim
      const websimPosts = connectionManager.room.collection('post').getList();
      if (websimPosts && websimPosts.length > 0) {
        connectionManager.storageManager.setWebsimPosts(websimPosts);
        setPosts(connectionManager.storageManager.getPosts());
      }
      
      // Subscribe to WebSim posts
      const unsubscribe = connectionManager.room.collection('post').subscribe((updatedPosts) => {
        connectionManager.storageManager.setWebsimPosts(updatedPosts);
        setPosts(connectionManager.storageManager.getPosts());
      });
      
      return () => unsubscribe();
    }
  }, [connectionManager]);
  
  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    
    await connectionManager.createPost(newPostContent);
    setNewPostContent('');
  };
  
  const handleAddNode = async () => {
    if (!newNodeInfo.id || !newNodeInfo.wsUrl) return;
    
    await connectionManager.addNode(newNodeInfo);
    setNewNodeInfo({ id: '', wsUrl: '', name: '' });
    setAddingNode(false);
  };
  
  const downloadNodeFiles = () => {
    const nodeFiles = connectionManager.prepareNodeFilesForDownload();
    
    // Create a zip file
    const zip = new JSZip();
    
    // Add files to the zip
    for (const [filename, content] of Object.entries(nodeFiles)) {
      zip.file(filename, content);
    }
    
    // Generate the zip file
    zip.generateAsync({ type: 'blob' })
      .then(function(content) {
        // Create a download link
        const link = document.getElementById('downloadLink');
        link.href = URL.createObjectURL(content);
        link.download = 'safespace-node.zip';
        link.click();
      });
  };
  
  if (!initialized) {
    return <div className="container">Loading SafeSpaceSocial...</div>;
  }
  
  return (
    <div className="container">
      <header className="app-header">
        <h1 className="app-title">SafeSpaceSocial</h1>
        <div className="connectivity-status">
          {/* WebSim Status */}
          <div className="status-item">
            <span className={`status-indicator ${websimStatus}`}></span>
            <span>WebSim</span>
          </div>
          
          {/* Database Status */}
          <div className="status-item">
            <span className={`status-indicator ${databaseStatus}`}></span>
            <span>Database</span>
          </div>
          
          {/* Node Statuses */}
          {Object.entries(nodeStatuses).map(([nodeId, status]) => (
            <div className="status-item" key={nodeId}>
              <span className={`status-indicator ${status}`}></span>
              <span>
                {connectionManager.knownNodes.find(n => n.id === nodeId)?.name || nodeId}
                {status === 'dead' && ' (Dead)'}
              </span>
            </div>
          ))}
        </div>
      </header>
      
      <div className="main-content">
        <div className="posts-container">
          <div className="compose-post">
            <h2>Create Post</h2>
            <textarea 
              className="compose-input" 
              placeholder="What's on your mind?"
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              rows={4}
            ></textarea>
            <button className="button" onClick={handleCreatePost}>Post</button>
          </div>
          
          <h2>Posts</h2>
          {posts.length > 0 ? (
            posts.map(post => (
              <div className="post" key={post.id}>
                <div className="post-header">
                  <img 
                    className="post-avatar" 
                    src={`https://images.websim.ai/avatar/${post.username}`} 
                    alt={post.username} 
                  />
                  <div>
                    <div className="post-author">{post.username}</div>
                    <div className="post-time">{new Date(post.timestamp || post.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="post-content">{post.content}</div>
              </div>
            ))
          ) : (
            <p>No posts yet. Be the first to post!</p>
          )}
        </div>
        
        <div className="sidebar">
          <div className="peers-section">
            <h2>Connected Users ({Object.keys(peers).length})</h2>
            {Object.values(peers).map(peer => (
              <div className="peer-item" key={peer.id}>
                <img 
                  className="peer-avatar" 
                  src={`https://images.websim.ai/avatar/${peer.username}`} 
                  alt={peer.username} 
                />
                <span>{peer.username} {peer.isP2P ? '(P2P)' : ''}</span>
              </div>
            ))}
          </div>
          
          <div className="nodes-list">
            <h2>Connected Nodes</h2>
            {connectionManager.knownNodes.length > 0 ? (
              connectionManager.knownNodes.map(node => (
                <div className="node-item" key={node.id}>
                  <div>
                    <div>{node.name || node.id}</div>
                    <div className="node-url">{node.wsUrl}</div>
                  </div>
                  <button 
                    className="button" 
                    onClick={() => connectionManager.removeNode(node.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p>No nodes added yet</p>
            )}
            
            {addingNode ? (
              <div className="add-node-form">
                <h3>Add New Node</h3>
                <input 
                  type="text" 
                  placeholder="Node ID" 
                  value={newNodeInfo.id} 
                  onChange={(e) => setNewNodeInfo({...newNodeInfo, id: e.target.value})}
                />
                <input 
                  type="text" 
                  placeholder="WebSocket URL (ws:// or wss://)" 
                  value={newNodeInfo.wsUrl} 
                  onChange={(e) => setNewNodeInfo({...newNodeInfo, wsUrl: e.target.value})}
                />
                <input 
                  type="text" 
                  placeholder="Node Name (optional)" 
                  value={newNodeInfo.name} 
                  onChange={(e) => setNewNodeInfo({...newNodeInfo, name: e.target.value})}
                />
                <div>
                  <button className="button" onClick={handleAddNode}>Save</button>
                  <button 
                    className="button" 
                    onClick={() => {
                      setNewNodeInfo({ id: '', wsUrl: '', name: '' });
                      setAddingNode(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button 
                className="button" 
                onClick={() => setAddingNode(true)}
              >
                Add Node
              </button>
            )}
          </div>
          
          <div className="download-section">
            <h3>Run Your Own Node</h3>
            <p>Download the node server code and run it locally to join the network.</p>
            <button className="button" onClick={downloadNodeFiles}>
              Download Node Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Load JSZip dynamically
const loadJSZip = async () => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(script);
  });
};

// Wait for JSZip to load before rendering the app
loadJSZip().then(() => {
  const rootElement = document.getElementById('root');
  ReactDOM.createRoot(rootElement).render(<App />);
}).catch(error => {
  console.error('Error loading JSZip:', error);
  const rootElement = document.getElementById('root');
  ReactDOM.createRoot(rootElement).render(
    <div className="container">
      <h1>Error loading SafeSpaceSocial</h1>
      <p>Failed to load required dependencies. Please try refreshing the page.</p>
    </div>
  );
});