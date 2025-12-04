// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CitySim_FHE is SepoliaConfig {
    struct EncryptedCity {
        euint32 residentialZones;   // Encrypted residential zone count
        euint32 commercialZones;    // Encrypted commercial zone count
        euint32 industrialZones;    // Encrypted industrial zone count
        euint32 publicServices;     // Encrypted public service count
    }
    
    struct CityStats {
        uint32 satisfactionScore;
        uint32 population;
        uint32 revenue;
        uint32 pollutionLevel;
    }

    uint256 public cityCount;
    mapping(uint256 => EncryptedCity) public playerCities;
    mapping(uint256 => CityStats) public decryptedStats;
    mapping(address => uint256) public playerToCity;
    
    event CityCreated(uint256 indexed cityId, address owner);
    event CityUpdated(uint256 indexed cityId);
    event StatsCalculated(uint256 indexed cityId);
    
    modifier onlyCityOwner(uint256 cityId) {
        require(playerToCity[msg.sender] == cityId, "Not city owner");
        _;
    }
    
    function createEncryptedCity(
        euint32 residential,
        euint32 commercial,
        euint32 industrial,
        euint32 services
    ) public {
        require(playerToCity[msg.sender] == 0, "Already has a city");
        
        cityCount += 1;
        uint256 newId = cityCount;
        
        playerCities[newId] = EncryptedCity({
            residentialZones: residential,
            commercialZones: commercial,
            industrialZones: industrial,
            publicServices: services
        });
        
        playerToCity[msg.sender] = newId;
        
        emit CityCreated(newId, msg.sender);
    }
    
    function updateEncryptedCity(
        uint256 cityId,
        euint32 residential,
        euint32 commercial,
        euint32 industrial,
        euint32 services
    ) public onlyCityOwner(cityId) {
        playerCities[cityId] = EncryptedCity({
            residentialZones: residential,
            commercialZones: commercial,
            industrialZones: industrial,
            publicServices: services
        });
        
        emit CityUpdated(cityId);
    }
    
    function calculateCityStats(uint256 cityId) public onlyCityOwner(cityId) {
        EncryptedCity storage city = playerCities[cityId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(city.residentialZones);
        ciphertexts[1] = FHE.toBytes32(city.commercialZones);
        ciphertexts[2] = FHE.toBytes32(city.industrialZones);
        ciphertexts[3] = FHE.toBytes32(city.publicServices);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processStats.selector);
        decryptedStats[reqId] = CityStats(0, 0, 0, 0);
        
        emit StatsCalculated(cityId);
    }
    
    function processStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 satisfaction, uint32 population, uint32 revenue, uint32 pollution) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        
        decryptedStats[requestId] = CityStats({
            satisfactionScore: satisfaction,
            population: population,
            revenue: revenue,
            pollutionLevel: pollution
        });
    }
    
    function getCityStats(uint256 cityId) public view returns (
        uint32 satisfaction,
        uint32 population,
        uint32 revenue,
        uint32 pollution
    ) {
        CityStats storage stats = decryptedStats[cityId];
        return (
            stats.satisfactionScore,
            stats.population,
            stats.revenue,
            stats.pollutionLevel
        );
    }
    
    function calculateOptimalZoneRatio(
        euint32 residential,
        euint32 commercial,
        euint32 industrial
    ) public pure returns (euint32) {
        euint32 totalZones = FHE.add(
            FHE.add(residential, commercial),
            industrial
        );
        
        return FHE.div(
            FHE.mul(residential, FHE.asEuint32(100)),
            totalZones
        );
    }
    
    function calculateSatisfaction(
        euint32 residential,
        euint32 commercial,
        euint32 industrial,
        euint32 services
    ) public pure returns (euint32) {
        euint32 baseScore = FHE.add(
            FHE.mul(residential, FHE.asEuint32(3)),
            FHE.mul(commercial, FHE.asEuint32(2))
        );
        
        euint32 penalty = FHE.mul(industrial, FHE.asEuint32(1));
        euint32 bonus = FHE.mul(services, FHE.asEuint32(5));
        
        return FHE.add(
            FHE.sub(baseScore, penalty),
            bonus
        );
    }
}