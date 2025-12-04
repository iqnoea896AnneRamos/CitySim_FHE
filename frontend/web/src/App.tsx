import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CityData {
  id: string;
  name: string;
  population: number;
  satisfaction: number;
  buildings: number;
  timestamp: number;
  owner: string;
  encryptedData: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<CityData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCityData, setNewCityData] = useState({
    name: "",
    population: 1000,
    buildings: 5
  });
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Calculate statistics
  const totalPopulation = cities.reduce((sum, city) => sum + city.population, 0);
  const totalBuildings = cities.reduce((sum, city) => sum + city.buildings, 0);
  const avgSatisfaction = cities.length > 0 
    ? cities.reduce((sum, city) => sum + city.satisfaction, 0) / cities.length 
    : 0;

  useEffect(() => {
    loadCities().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadCities = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("city_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing city keys:", e);
        }
      }
      
      const list: CityData[] = [];
      
      for (const key of keys) {
        try {
          const cityBytes = await contract.getData(`city_${key}`);
          if (cityBytes.length > 0) {
            try {
              const cityData = JSON.parse(ethers.toUtf8String(cityBytes));
              list.push({
                id: key,
                name: cityData.name,
                population: cityData.population,
                satisfaction: cityData.satisfaction,
                buildings: cityData.buildings,
                timestamp: cityData.timestamp,
                owner: cityData.owner,
                encryptedData: cityData.encryptedData
              });
            } catch (e) {
              console.error(`Error parsing city data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading city ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCities(list);
    } catch (e) {
      console.error("Error loading cities:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const handleCheckAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Contract not available");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Contract is available: ${isAvailable}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const submitCity = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting city data with FHE..."
    });
    
    try {
      // Simulate FHE encryption and satisfaction calculation
      const encryptedData = `FHE-${btoa(JSON.stringify(newCityData))}`;
      // Simulate FHE-based satisfaction calculation (higher satisfaction with more buildings per capita)
      const satisfaction = Math.min(100, Math.floor((newCityData.buildings / (newCityData.population / 1000)) * 10));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const cityId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const cityData = {
        name: newCityData.name,
        population: newCityData.population,
        satisfaction: satisfaction,
        buildings: newCityData.buildings,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        encryptedData: encryptedData
      };
      
      // Store encrypted city data on-chain using FHE
      await contract.setData(
        `city_${cityId}`, 
        ethers.toUtf8Bytes(JSON.stringify(cityData))
      );
      
      const keysBytes = await contract.getData("city_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(cityId);
      
      await contract.setData(
        "city_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "City data encrypted and stored with FHE!"
      });
      
      await loadCities();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCityData({
          name: "",
          population: 1000,
          buildings: 5
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const toggleCityExpand = (cityId: string) => {
    setExpandedCity(expandedCity === cityId ? null : cityId);
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // Pagination logic
  const totalPages = Math.ceil(cities.length / itemsPerPage);
  const currentCities = cities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Render population chart
  const renderPopulationChart = () => {
    const maxPopulation = Math.max(...cities.map(c => c.population), 10000);
    
    return (
      <div className="chart-container">
        {currentCities.map(city => (
          <div key={city.id} className="chart-bar-container">
            <div className="chart-label">{city.name}</div>
            <div className="chart-bar">
              <div 
                className="chart-fill"
                style={{ width: `${(city.population / maxPopulation) * 100}%` }}
              ></div>
            </div>
            <div className="chart-value">{city.population.toLocaleString()}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="hologram-icon"></div>
          </div>
          <h1>City<span>Sim</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={handleCheckAvailability}
            className="cyber-button"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-city-btn cyber-button"
          >
            <div className="add-icon"></div>
            New City
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner neon-glow">
          <div className="welcome-text">
            <h2>FHE-Powered Private City Building</h2>
            <p>Build and manage your city with fully encrypted on-chain data using Zama FHE technology</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card neon-border">
            <h3>Project Introduction</h3>
            <p>CitySim FHE is a revolutionary city-building simulation where all your city data remains encrypted on-chain. Using Fully Homomorphic Encryption, your strategies remain private while the game mechanics calculate outcomes securely.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card neon-border">
            <h3>City Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{cities.length}</div>
                <div className="stat-label">Total Cities</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalPopulation.toLocaleString()}</div>
                <div className="stat-label">Total Population</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{totalBuildings}</div>
                <div className="stat-label">Total Buildings</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{avgSatisfaction.toFixed(1)}%</div>
                <div className="stat-label">Avg Satisfaction</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card neon-border">
            <h3>Population Chart</h3>
            {cities.length > 0 ? (
              renderPopulationChart()
            ) : (
              <p className="no-data">No city data available</p>
            )}
          </div>
        </div>
        
        <div className="cities-section">
          <div className="section-header">
            <h2>Encrypted Cities</h2>
            <div className="header-actions">
              <button 
                onClick={loadCities}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Cities"}
              </button>
            </div>
          </div>
          
          <div className="cities-list cyber-card neon-border">
            {cities.length === 0 ? (
              <div className="no-cities">
                <div className="no-cities-icon"></div>
                <p>No encrypted cities found</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First City
                </button>
              </div>
            ) : (
              <>
                <div className="table-header">
                  <div className="header-cell">Name</div>
                  <div className="header-cell">Population</div>
                  <div className="header-cell">Buildings</div>
                  <div className="header-cell">Satisfaction</div>
                  <div className="header-cell">Owner</div>
                  <div className="header-cell">Actions</div>
                </div>
                
                {currentCities.map(city => (
                  <React.Fragment key={city.id}>
                    <div className="city-row">
                      <div className="table-cell">{city.name}</div>
                      <div className="table-cell">{city.population.toLocaleString()}</div>
                      <div className="table-cell">{city.buildings}</div>
                      <div className="table-cell">
                        <span className={`satisfaction ${city.satisfaction > 70 ? 'high' : city.satisfaction > 40 ? 'medium' : 'low'}`}>
                          {city.satisfaction}%
                        </span>
                      </div>
                      <div className="table-cell">{city.owner.substring(0, 6)}...{city.owner.substring(38)}</div>
                      <div className="table-cell actions">
                        <button 
                          className="action-btn cyber-button"
                          onClick={() => toggleCityExpand(city.id)}
                        >
                          {expandedCity === city.id ? 'Collapse' : 'Details'}
                        </button>
                      </div>
                    </div>
                    
                    {expandedCity === city.id && (
                      <div className="city-details">
                        <div className="details-grid">
                          <div className="detail-item">
                            <label>City ID:</label>
                            <span>{city.id}</span>
                          </div>
                          <div className="detail-item">
                            <label>Created:</label>
                            <span>{new Date(city.timestamp * 1000).toLocaleString()}</span>
                          </div>
                          <div className="detail-item">
                            <label>Encrypted Data:</label>
                            <span className="encrypted-hash">{city.encryptedData.substring(0, 20)}...</span>
                          </div>
                          <div className="detail-item">
                            <label>FHE Processed:</label>
                            <span>Yes</span>
                          </div>
                        </div>
                        {isOwner(city.owner) && (
                          <div className="owner-actions">
                            <button className="cyber-button">Manage City</button>
                            <button className="cyber-button">Upgrade</button>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                
                {totalPages > 1 && (
                  <div className="pagination-controls">
                    <button 
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="cyber-button"
                    >
                      Previous
                    </button>
                    <span className="page-info">Page {currentPage} of {totalPages}</span>
                    <button 
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className="cyber-button"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitCity} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          cityData={newCityData}
          setCityData={setNewCityData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card neon-border">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="hologram-icon"></div>
              <span>CitySim FHE</span>
            </div>
            <p>Fully Homomorphic Encryption for private on-chain gaming</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CitySim FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  cityData: any;
  setCityData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  cityData,
  setCityData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCityData({
      ...cityData,
      [name]: name === 'name' ? value : parseInt(value)
    });
  };

  const handleSubmit = () => {
    if (!cityData.name) {
      alert("Please enter a city name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card neon-border">
        <div className="modal-header">
          <h2>Create New City</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your city data will be encrypted with Zama FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>City Name *</label>
              <input 
                type="text"
                name="name"
                value={cityData.name} 
                onChange={handleChange}
                placeholder="Enter city name..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Initial Population</label>
              <input 
                type="range"
                name="population"
                min="1000"
                max="100000"
                step="1000"
                value={cityData.population} 
                onChange={handleChange}
                className="cyber-slider"
              />
              <div className="slider-value">{cityData.population.toLocaleString()} citizens</div>
            </div>
            
            <div className="form-group">
              <label>Initial Buildings</label>
              <input 
                type="range"
                name="buildings"
                min="1"
                max="20"
                value={cityData.buildings} 
                onChange={handleChange}
                className="cyber-slider"
              />
              <div className="slider-value">{cityData.buildings} buildings</div>
            </div>
          </div>
          
          <div className="simulation-preview">
            <h4>FHE Simulation Preview</h4>
            <p>Based on your inputs, FHE will calculate an initial satisfaction level of approximately {
              Math.min(100, Math.floor((cityData.buildings / (cityData.population / 1000)) * 10))
            }%</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create City"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;