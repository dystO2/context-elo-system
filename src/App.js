import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Constants for Elo calculations
const K_FACTOR = 0.1;
const LATENCY_WEIGHT = 0.02;
const MAP_FAMILIARITY_WEIGHT = 0.0002;
const AFK_WEIGHT = 0.06;

// Helper functions
const generateRandomNumber = (min, max, decimals = 3) => {
  return (Math.random() * (max - min) + min).toFixed(decimals);
};

const generatePlayers = (existingPlayers) => {
  const players = [...existingPlayers]; // Preserve existing players
  const startId = existingPlayers.length + 1; // Continue ID sequence

  for (let i = startId; i < startId + 50; i++) {
    players.push({
      id: `P${i.toString().padStart(3, "0")}`,
      elo: generateRandomNumber(0, 1), // Elo between 0-1 (3 decimals)
      lastElo: "-",
      rankChange: "", // Initially blank
      bestMap: "", // Initially blank
      hoursA: null, // Will be generated later
      hoursB: null,
      hoursC: null,
    });
  }
  return players;
};

const generateHours = (players) => {
  return players.map(player => ({
    ...player,
    hoursA: Math.floor(Math.random() * 31), // Random hours (0-30)
    hoursB: Math.floor(Math.random() * 31),
    hoursC: Math.floor(Math.random() * 31),
  }));
};

const calculateMapFamiliarity = (players) => {
  const validPlayers = players.filter(p => p.hoursA !== null && p.hoursB !== null && p.hoursC !== null);

  if (validPlayers.length === 0) return players;

  // Calculate Average Hours Spent Per Map
  const avgA = validPlayers.reduce((sum, p) => sum + p.hoursA, 0) / validPlayers.length || 1;
  const avgB = validPlayers.reduce((sum, p) => sum + p.hoursB, 0) / validPlayers.length || 1;
  const avgC = validPlayers.reduce((sum, p) => sum + p.hoursC, 0) / validPlayers.length || 1;

  return players.map(player => {
    if (player.hoursA === null || player.hoursB === null || player.hoursC === null) {
      return player;
    }

    // Map Familiarity Calculation (as a hundredth percentage)
    const familiarityA = ((player.hoursA / avgA) * 100).toFixed(2);
    const familiarityB = ((player.hoursB / avgB) * 100).toFixed(2);
    const familiarityC = ((player.hoursC / avgC) * 100).toFixed(2);

    // Select Best Map based on highest familiarity value
    const familiarityMap = {
      "Map A": parseFloat(familiarityA),
      "Map B": parseFloat(familiarityB),
      "Map C": parseFloat(familiarityC),
    };

    const bestMap = Object.keys(familiarityMap).reduce((a, b) => familiarityMap[a] > familiarityMap[b] ? a : b);

    return {
      ...player,
      mapFamiliarityA: familiarityA,
      mapFamiliarityB: familiarityB,
      mapFamiliarityC: familiarityC,
      bestMap: bestMap, // Assign best map correctly
    };
  });
};

// Generate network stability with realistic distribution
const generateNetworkStability = () => {
  // 80% chance of good connection (0.8-1.0)
  // 15% chance of moderate issues (0.5-0.79)
  // 5% chance of poor connection (0.1-0.49)
  const rand = Math.random();
  
  if (rand < 0.05) {
    // Poor connection (5% chance)
    return parseFloat((Math.random() * 0.39 + 0.1).toFixed(2));
  } else if (rand < 0.2) {
    // Moderate issues (15% chance)
    return parseFloat((Math.random() * 0.29 + 0.5).toFixed(2));
  } else {
    // Good connection (80% chance)
    return parseFloat((Math.random() * 0.2 + 0.8).toFixed(2));
  }
};

// Simulate AFK teammates - ensuring every match has at least one AFK player
const generateAFKStatus = (teamPlayers) => {
  // Choose one random player to be AFK
  const afkPlayerIndex = Math.floor(Math.random() * teamPlayers.length);
  
  // Generate how long they were AFK (mostly smaller values to be realistic)
  // 70% chance of brief AFK (10-30% of match time)
  // 20% chance of moderate AFK (30-60% of match time)
  // 10% chance of severe AFK (60-90% of match time)
  let afkPercentage;
  const rand = Math.random();
  
  if (rand < 0.7) {
    // Brief AFK (more common)
    afkPercentage = parseFloat((Math.random() * 0.2 + 0.1).toFixed(2));
  } else if (rand < 0.9) {
    // Moderate AFK
    afkPercentage = parseFloat((Math.random() * 0.3 + 0.3).toFixed(2));
  } else {
    // Severe AFK (rare)
    afkPercentage = parseFloat((Math.random() * 0.3 + 0.6).toFixed(2));
  }
  
  // Assign AFK values to team
  return teamPlayers.map((player, index) => ({
    ...player,
    afkValue: index === afkPlayerIndex ? 0 : afkPercentage
  }));
};

// Pick 10 players with similar ELO scores
const pickPlayersForMatch = (players) => {
  if (players.length < 10) return [];
  
  // Sort players by ELO
  const sortedPlayers = [...players].sort((a, b) => parseFloat(a.elo) - parseFloat(b.elo));
  
  // Find a window of 10 players with minimal ELO difference
  let bestStartIndex = 0;
  let minEloDifference = 1; // Max possible difference is 1
  
  for (let i = 0; i <= sortedPlayers.length - 10; i++) {
    const currentDifference = parseFloat(sortedPlayers[i + 9].elo) - parseFloat(sortedPlayers[i].elo);
    if (currentDifference < minEloDifference) {
      minEloDifference = currentDifference;
      bestStartIndex = i;
    }
  }
  
  // Return the 10 players with the most similar ELO
  return sortedPlayers.slice(bestStartIndex, bestStartIndex + 10);
};

// Divide players into two teams
const divideIntoTeams = (selectedPlayers) => {
  // Shuffle players
  const shuffled = [...selectedPlayers].sort(() => 0.5 - Math.random());
  
  // Split into two teams
  const teamA = shuffled.slice(0, 5);
  const teamB = shuffled.slice(5, 10);
  
  return { teamA, teamB };
};

// Assign kills and deaths based on network stability and AFK status
const assignKillsAndDeaths = (teamA, teamB) => {
  // First assign network stability and AFK status to have context for kills/deaths
  const assignNetworkAndAFK = (team) => {
    return team.map(player => ({
      ...player,
      networkStability: generateNetworkStability(),
      // Will be updated later in generateAFKStatus
      afkValue: 0
    }));
  };
  
  const teamAWithContext = assignNetworkAndAFK(teamA);
  const teamBWithContext = assignNetworkAndAFK(teamB);
  
  // Apply AFK status
  const teamAWithAFK = generateAFKStatus(teamAWithContext);
  const teamBWithAFK = generateAFKStatus(teamBWithContext);
  
  // Assign kills and deaths based on network stability and AFK status
  const assignStats = (player) => {
    // Calculate performance factor (0-1) based on network stability and AFK status
    // A player with perfect connection (1.0) and no AFK (0.0) gets full performance factor (1.0)
    // A player with poor connection or high AFK time gets reduced performance
    const performanceFactor = player.networkStability * (1 - player.afkValue);
    
    // Base kill range is 1-20
    // Scale based on performance factor
    const maxPossibleKills = 20;
    const killCeiling = Math.max(1, Math.floor(maxPossibleKills * performanceFactor));
    
    // Players with very poor performance (AFK or bad connection) rarely get kills
    let kills;
    if (performanceFactor < 0.3) {
      // 95% chance of very few kills (0-2) for poor performers
      if (Math.random() < 0.95) {
        kills = Math.floor(Math.random() * 3); // 0-2 kills
      } else {
        // 5% chance to get a few more kills despite poor performance
        kills = Math.floor(Math.random() * killCeiling) + 1;
      }
    } else {
      // Normal kill distribution for average to good performers
      kills = Math.floor(Math.random() * killCeiling) + 1;
    }
    
    // Deaths tend to be higher with worse connection/AFK
    // AFK players especially have higher deaths
    let deaths;
    if (player.afkValue > 0.5) {
      // High AFK players die more (AFK in dangerous situations)
      deaths = Math.floor(Math.random() * 10) + 10; // 10-19 deaths
    } else if (player.networkStability < 0.5) {
      // Players with poor connection die more
      deaths = Math.floor(Math.random() * 12) + 8; // 8-19 deaths
    } else {
      // Normal death distribution for stable players
      deaths = Math.floor(Math.random() * 15) + 1; // 1-15 deaths
    }
    
    return {
      ...player,
      kills,
      deaths,
      kd: 0 // Will be calculated later
    };
  };
  
  const teamAWithStats = teamAWithAFK.map(assignStats);
  const teamBWithStats = teamBWithAFK.map(assignStats);
  
  // Calculate K/D ratios
  const calculateKD = (player) => ({
    ...player,
    kd: parseFloat((player.kills / Math.max(1, player.deaths)).toFixed(2)), // Avoid division by zero
  });
  
  return {
    teamA: teamAWithStats.map(calculateKD),
    teamB: teamBWithStats.map(calculateKD),
  };
};

// Select a random map and assign map familiarity
const selectMapAndAssignFamiliarity = (teamA, teamB) => {
  const maps = ["A", "B", "C"];
  const selectedMap = maps[Math.floor(Math.random() * maps.length)];
  
  const assignMapFamiliarity = (player) => ({
    ...player,
    currentMapFamiliarity: parseFloat(player[`mapFamiliarity${selectedMap}`] || 0)
  });
  
  return {
    selectedMap,
    teamA: teamA.map(assignMapFamiliarity),
    teamB: teamB.map(assignMapFamiliarity)
  };
};

// Determine match winner
const determineWinner = (teamA, teamB) => {
  const teamAAvgKD = teamA.reduce((sum, player) => sum + parseFloat(player.kd), 0) / teamA.length;
  const teamBAvgKD = teamB.reduce((sum, player) => sum + parseFloat(player.kd), 0) / teamB.length;
  
  return {
    teamAAvgKD: teamAAvgKD.toFixed(2),
    teamBAvgKD: teamBAvgKD.toFixed(2),
    winner: teamAAvgKD > teamBAvgKD ? "Team A" : "Team B",
  };
};

// Calculate traditional Elo adjustments
const calculateTraditionalElo = (teamA, teamB, matchResult) => {
  // Calculate team average Elo
  const teamAAvgElo = teamA.reduce((sum, player) => sum + parseFloat(player.elo), 0) / teamA.length;
  const teamBAvgElo = teamB.reduce((sum, player) => sum + parseFloat(player.elo), 0) / teamB.length;
  
  // Calculate expected outcome using Elo formula
  const expectedA = 1 / (1 + Math.pow(10, (teamBAvgElo - teamAAvgElo) * 10));
  const expectedB = 1 - expectedA;
  
  // Actual outcome
  const actualA = matchResult.winner === "Team A" ? 1 : 0;
  const actualB = 1 - actualA;
  
  // Calculate Elo adjustments
  const calculateNewElo = (player, isTeamA) => {
    const expected = isTeamA ? expectedA : expectedB;
    const actual = isTeamA ? actualA : actualB;
    
    // Store last Elo
    const lastElo = parseFloat(player.elo);
    
    // Calculate new Elo
    const newElo = parseFloat(player.elo) + K_FACTOR * (actual - expected);
    
    // Ensure Elo stays within bounds (0-1)
    const boundedElo = Math.max(0, Math.min(1, newElo));
    
    return {
      ...player,
      tradElo: parseFloat(boundedElo.toFixed(3)),
      lastElo: lastElo.toFixed(3),
      rankChange: (boundedElo > lastElo) ? "↑" : (boundedElo < lastElo) ? "↓" : "="
    };
  };
  
  return {
    teamA: teamA.map(player => calculateNewElo(player, true)),
    teamB: teamB.map(player => calculateNewElo(player, false)),
    expectedA,
    expectedB
  };
};

// Calculate context-aware Elo adjustments
const calculateContextAwareElo = (teamA, teamB, matchResult, tradEloResults) => {
  // Use the expected outcome from traditional Elo
  const expectedA = tradEloResults.expectedA;
  const expectedB = tradEloResults.expectedB;
  
  // Actual outcome
  const actualA = matchResult.winner === "Team A" ? 1 : 0;
  const actualB = 1 - actualA;
  
  // Calculate Context-Aware Elo adjustments
  const calculateNewContextElo = (player, isTeamA) => {
    const expected = isTeamA ? expectedA : expectedB;
    const actual = isTeamA ? actualA : actualB;
    
    // Contextual factors
    const latencyFactor = (player.networkStability - 1) * LATENCY_WEIGHT; // Negative adjustment for poor connection
    const mapFactor = (player.currentMapFamiliarity) * MAP_FAMILIARITY_WEIGHT; // Adjust based on map familiarity
    const afkFactor = player.afkValue * AFK_WEIGHT * -1; // Negative adjustment for having AFK teammates
    
    // Store traditional Elo result
    const tradElo = player.tradElo;
    
    // Calculate context-aware Elo adjustment
    // R′ = R + K(S - E) + wL + wM + wA
    const eloAdjustment = K_FACTOR * (actual - expected);
    const contextAdjustment = latencyFactor + mapFactor + afkFactor;
    const newElo = parseFloat(player.elo) + eloAdjustment + contextAdjustment;
    
    // Ensure Elo stays within bounds (0-1)
    const boundedElo = Math.max(0, Math.min(1, newElo));
    
    return {
      ...player,
      contextElo: parseFloat(boundedElo.toFixed(3)),
      tradElo: tradElo,
      contextFactors: {
        latency: parseFloat(latencyFactor.toFixed(4)),
        map: parseFloat(mapFactor.toFixed(4)),
        afk: parseFloat(afkFactor.toFixed(4)),
        total: parseFloat(contextAdjustment.toFixed(4))
      }
    };
  };
  
  return {
    teamA: teamA.map(player => calculateNewContextElo(player, true)),
    teamB: teamB.map(player => calculateNewContextElo(player, false))
  };
};

function App() {
  const [players, setPlayers] = useState([]);
  const [showMapDatabase, setShowMapDatabase] = useState(false);
  const [hoursGenerated, setHoursGenerated] = useState(false);
  const [showMatchSimulator, setShowMatchSimulator] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [teams, setTeams] = useState({ teamA: [], teamB: [] });
  const [matchResult, setMatchResult] = useState(null);
  const [matchStage, setMatchStage] = useState(0); // 0: Not started, 1: Players selected, 2: Match simulated, 3: Elo calculated
  const [selectedMap, setSelectedMap] = useState(null);
  const [showEloVisualization, setShowEloVisualization] = useState(false);
  const [eloResults, setEloResults] = useState({
    traditional: { teamA: [], teamB: [] },
    contextAware: { teamA: [], teamB: [] },
  });

  const handleGenerateHours = () => {
    const playersWithHours = generateHours(players);
    const calculatedPlayers = calculateMapFamiliarity(playersWithHours);
    setPlayers(calculatedPlayers);
    setHoursGenerated(true);
  };

  const handlePickPlayers = () => {
    const pickedPlayers = pickPlayersForMatch(players);
    setSelectedPlayers(pickedPlayers);
    const { teamA, teamB } = divideIntoTeams(pickedPlayers);
    setTeams({ teamA, teamB });
    setMatchStage(1);
  };

  const handleSimulateMatch = () => {
    // Generate stats, network stability, and AFK status
    const teamsWithStats = assignKillsAndDeaths(teams.teamA, teams.teamB);
    
    // Select map and assign familiarity
    const { selectedMap: map, teamA, teamB } = selectMapAndAssignFamiliarity(
      teamsWithStats.teamA, 
      teamsWithStats.teamB
    );
    
    // Calculate final result
    setTeams({ teamA, teamB });
    setSelectedMap(map);
    
    const result = determineWinner(teamA, teamB);
    setMatchResult(result);
    setMatchStage(2);
    
    // Reset Elo visualization
    setShowEloVisualization(false);
  };

  // Add new function for calculating Elo
  const handleCalculateElo = () => {
    // Calculate traditional Elo
    const tradEloResults = calculateTraditionalElo(teams.teamA, teams.teamB, matchResult);
    
    // Calculate context-aware Elo
    const contextEloResults = calculateContextAwareElo(
      tradEloResults.teamA, 
      tradEloResults.teamB, 
      matchResult,
      tradEloResults
    );
    
    // Update state with results
    setEloResults({
      traditional: {
        teamA: tradEloResults.teamA,
        teamB: tradEloResults.teamB
      },
      contextAware: {
        teamA: contextEloResults.teamA,
        teamB: contextEloResults.teamB
      }
    });
    
    setMatchStage(3);
  };

  const resetMatch = () => {
    setSelectedPlayers([]);
    setTeams({ teamA: [], teamB: [] });
    setMatchResult(null);
    setSelectedMap(null);
    setMatchStage(0);
    setShowEloVisualization(false);
  };

  // Prepare data for Elo comparison chart
  const prepareChartData = () => {
    if (matchStage < 3) return [];
    
    const allPlayers = [...eloResults.contextAware.teamA, ...eloResults.contextAware.teamB];
    
    return allPlayers.map(player => ({
      id: player.id,
      previousElo: parseFloat(player.lastElo),
      traditionalElo: player.tradElo,
      contextElo: player.contextElo,
      // Determine if this was a win or loss for the player
      isWinner: (eloResults.contextAware.teamA.some(p => p.id === player.id) && matchResult.winner === "Team A") ||
                (eloResults.contextAware.teamB.some(p => p.id === player.id) && matchResult.winner === "Team B")
    }));
  };

  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Match Simulator with Context-Aware Elo</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <button onClick={() => {
          setPlayers(generatePlayers(players));
          setHoursGenerated(false);
          resetMatch();
        }}>Generate Players</button>
        
        <button style={{ marginLeft: "10px" }} onClick={() => {
          setShowMapDatabase(false);
          setShowMatchSimulator(false);
        }}>Player List</button>
        
        <button style={{ marginLeft: "10px" }} onClick={() => {
          setShowMapDatabase(true);
          setShowMatchSimulator(false);
        }}>Map Database</button>
        
        <button style={{ marginLeft: "10px" }} onClick={() => {
          setShowMatchSimulator(true);
          setShowMapDatabase(false);
          resetMatch();
        }}>Match Simulator</button>
      </div>
      
      {!showMapDatabase && !showMatchSimulator ? (
        <div>
          <table border="1" style={{ marginTop: "20px", width: "80%", marginLeft: "auto", marginRight: "auto" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Elo</th>
                <th>Last Elo</th>
                <th>Rank Change</th>
                <th>Best Map</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.id}</td>
                  <td>{player.elo}</td>
                  <td>{player.lastElo}</td>
                  <td>{player.rankChange}</td>
                  <td>{player.bestMap || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : showMapDatabase ? (
        <div>
          <button onClick={handleGenerateHours}>Generate Hours</button>
          <h2>Map Database</h2>
          <table border="1" style={{ marginTop: "20px", width: "80%", marginLeft: "auto", marginRight: "auto" }}>
            <thead>
              <tr>
                <th>Player ID</th>
                <th>Hours on Map A</th>
                <th>Hours on Map B</th>
                <th>Hours on Map C</th>
                <th>Map Familiarity A</th>
                <th>Map Familiarity B</th>
                <th>Map Familiarity C</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.id}</td>
                  <td>{player.hoursA !== null ? player.hoursA : '-'}</td>
                  <td>{player.hoursB !== null ? player.hoursB : '-'}</td>
                  <td>{player.hoursC !== null ? player.hoursC : '-'}</td>
                  <td>{player.mapFamiliarityA || '-'}</td>
                  <td>{player.mapFamiliarityB || '-'}</td>
                  <td>{player.mapFamiliarityC || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <h2>Match Simulator</h2>
          
          {players.length < 10 ? (
            <div style={{ margin: "20px", color: "red" }}>
              You need at least 10 players to simulate a match. Currently you have {players.length} players.
            </div>
          ) : !hoursGenerated ? (
            <div style={{ margin: "20px", color: "red" }}>
              You need to generate map familiarity data first. Go to Map Database and click "Generate Hours".
            </div>
          ) : (
            <>
              {matchStage === 0 && (
                <button onClick={handlePickPlayers}>Pick 10 Players with Similar ELO</button>
              )}
              
              {matchStage >= 1 && (
                <div style={{ margin: "20px" }}>
                  <h3>Selected Players</h3>
                  <div style={{ display: "flex", justifyContent: "space-around" }}>
                    <div>
                      <h4>Team A</h4>
                      <table border="1" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>ELO</th>
                            {matchStage >= 2 && (
                              <>
                                <th>Kills</th>
                                <th>Deaths</th>
                                <th>K/D</th>
                                <th>Network</th>
                                <th>AFK</th>
                                <th>Map Fam.</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {teams.teamA.map(player => (
                            <tr key={player.id}>
                              <td>{player.id}</td>
                              <td>{player.elo}</td>
                              {matchStage >= 2 && (
                                <>
                                  <td>{player.kills}</td>
                                  <td>{player.deaths}</td>
                                  <td>{player.kd}</td>
                                  <td>{player.networkStability?.toFixed(2) || '-'}</td>
                                  <td>{player.afkValue?.toFixed(2) || '-'}</td>
                                  <td>{player.currentMapFamiliarity?.toFixed(2) || '-'}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4>Team B</h4>
                      <table border="1" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>ELO</th>
                            {matchStage >= 2 && (
                              <>
                                <th>Kills</th>
                                <th>Deaths</th>
                                <th>K/D</th>
                                <th>Network</th>
                                <th>AFK</th>
                                <th>Map Fam.</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {teams.teamB.map(player => (
                            <tr key={player.id}>
                              <td>{player.id}</td>
                              <td>{player.elo}</td>
                              {matchStage >= 2 && (
                                <>
                                  <td>{player.kills}</td>
                                  <td>{player.deaths}</td>
                                  <td>{player.kd}</td>
                                  <td>{player.networkStability?.toFixed(2) || '-'}</td>
                                  <td>{player.afkValue?.toFixed(2) || '-'}</td>
                                  <td>{player.currentMapFamiliarity?.toFixed(2) || '-'}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {matchStage === 1 && (
                    <button style={{ marginTop: "20px" }} onClick={handleSimulateMatch}>
                      Simulate Match (Assign Kills/Deaths)
                    </button>
                  )}
                  
                  {matchStage === 2 && matchResult && (
                    <div>
                      <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f0f0f0", borderRadius: "5px" }}>
                        <h3>Match Results</h3>
                        <p>Map: {selectedMap ? `Map ${selectedMap}` : "Unknown"}</p>
                        <p>Team A Average K/D: {matchResult.teamAAvgKD}</p>
                        <p>Team B Average K/D: {matchResult.teamBAvgKD}</p>
                        <p style={{ fontWeight: "bold", fontSize: "1.2em" }}>
                          Winner: {matchResult.winner}
                        </p>
                      </div>
                      
                      <div style={{ marginTop: "20px" }}>
                        <button onClick={handleCalculateElo} style={{ marginRight: "10px", backgroundColor: "#4CAF50", color: "white", padding: "10px 15px" }}>
                          Calculate Elo Ratings
                        </button>
                        <button onClick={resetMatch}>
                          Start New Match
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {matchStage === 3 && (
                    <div style={{ marginTop: "20px" }}>
                      <h3>Elo Calculation Results</h3>
                      
                      <div>
                        <button 
                          onClick={() => setShowEloVisualization(!showEloVisualization)} 
                          style={{ marginBottom: "20px", backgroundColor: "#2196F3", color: "white", padding: "10px 15px" }}
                        >
                          {showEloVisualization ? "Hide Visualization" : "Show Visualization"}
                        </button>
                      </div>
                      
                      {showEloVisualization && (
                        <div style={{ height: "400px", width: "80%", margin: "20px auto" }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={prepareChartData()}
                              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="id" />
                              <YAxis domain={[0, 1]} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="previousElo" name="Previous Elo" stroke="#FFA500" />
                              <Line type="monotone" dataKey="traditionalElo" name="Traditional Elo" stroke="#FF0000" />
                              <Line type="monotone" dataKey="contextElo" name="Context-Aware Elo" stroke="#00AA00" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px" }}>
                        <div>
                          <h4>Traditional Elo System</h4>
                          <div style={{ display: "flex", justifyContent: "space-around" }}>
                            <div>
                              <h5>Team A</h5>
                              <table border="1" style={{ width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    <th>Previous</th>
                                    <th>New Elo</th>
                                    <th>Change</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {eloResults.traditional.teamA.map(player => (
                                    <tr key={player.id}>
                                      <td>{player.id}</td>
                                      <td>{player.lastElo}</td>
                                      <td>{player.tradElo}</td>
                                      <td>{((player.tradElo - player.lastElo) * 1000).toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <h5>Team B</h5>
                              <table border="1" style={{ width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    <th>Previous</th>
                                    <th>New Elo</th>
                                    <th>Change</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {eloResults.traditional.teamB.map(player => (
                                    <tr key={player.id}>
                                      <td>{player.id}</td>
                                      <td>{player.lastElo}</td>
                                      <td>{player.tradElo}</td>
                                      <td>{((player.tradElo - player.lastElo) * 1000).toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                        
                        <div>
                          <h4>Context-Aware Elo System</h4>
                          <div style={{ display: "flex", justifyContent: "space-around" }}>
                            <div>
                              <h5>Team A</h5>
                              <table border="1" style={{ width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    <th>Previous</th>
                                    <th>New Elo</th>
                                    <th>Change</th>
                                    <th>Factors</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {eloResults.contextAware.teamA.map(player => (
                                    <tr key={player.id}>
                                      <td>{player.id}</td>
                                      <td>{player.lastElo}</td>
                                      <td>{player.contextElo}</td>
                                      <td>{((player.contextElo - player.lastElo) * 1000).toFixed(1)}</td>
                                      <td>
                                        L: {player.contextFactors.latency.toFixed(4)}<br />
                                        M: {player.contextFactors.map.toFixed(4)}<br />
                                        A: {player.contextFactors.afk.toFixed(4)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <h5>Team B</h5>
                              <table border="1" style={{ width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    <th>Previous</th>
                                    <th>New Elo</th>
                                    <th>Change</th>
                                    <th>Factors</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {eloResults.contextAware.teamB.map(player => (
                                    <tr key={player.id}>
                                      <td>{player.id}</td>
                                      <td>{player.lastElo}</td>
                                      <td>{player.contextElo}</td>
                                      <td>{((player.contextElo - player.lastElo) * 1000).toFixed(1)}</td>
                                      <td>
                                        L: {player.contextFactors.latency.toFixed(4)}<br />
                                        M: {player.contextFactors.map.toFixed(4)}<br />
                                        A: {player.contextFactors.afk.toFixed(4)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ marginTop: "20px" }}>
                        <button onClick={resetMatch}>Start New Match</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;