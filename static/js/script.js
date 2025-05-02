document.addEventListener('DOMContentLoaded', function() {
    // Constants
    const FIRSTBLOODS_API_URL = '/api/firstbloods';
    const MOCK_MODE = false;
    
    // DOM Elements
    const scoreboardBody = document.getElementById('scoreboard-body');
    const bloodSoundElement = document.getElementById('blood-sound-element');
    
    // State
    let bloodsData = [];
    let knownSolves = new Set();
    let lastFetchTime = 0;
    
    // Audio context initialization
    let audioContext;
    
    // Add keyboard event listener for "/" key
    document.addEventListener('keydown', function(event) {
        if (event.key === '/') {
            playBloodSound();
        }
    });
    
    // Audio context handler
    function enableSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            
            // Create empty buffer
            const buffer = audioContext.createBuffer(1, 1, 22050);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
            
            audioContext.resume().then(() => {
                console.log('Audio context successfully initialized');
            });
        } catch(e) {
            console.error('Audio context initialization failed:', e);
        }
    }
    
    // Manual sound play function
    window.playBloodSound = function() {
        if (bloodSoundElement) {
            bloodSoundElement.currentTime = 0;
            bloodSoundElement.play()
                .then(() => console.debug('Blood sound played successfully'))
                .catch(e => console.error('Playback error:', e));
        } else {
            console.error('Blood sound element not found');
        }
    };
    
    // Initialize
    console.log('Blood announcer initialized');
    fetchBloods(false);
    
    // Set up polling
    function setupPolling() {
        console.log('Setting up polling - checking for blood every 5 seconds');
        setInterval(() => fetchBloods(true), 5000);
        setInterval(() => fetchBloods(false), 60000);
    }
    
    setupPolling();
    
    // Fetch blood data
    async function fetchBloods(silent = false) {
        if (!silent) {
            scoreboardBody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="4">Loading first blood data...</td>
                </tr>
            `;
        }
        
        try {
            const url = MOCK_MODE ? '/api/mock/solves' : FIRSTBLOODS_API_URL;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Failed to fetch first bloods');
            
            const data = await response.json();
            const newBloods = Array.isArray(data) ? data : (data.data || []);
            
            // Process new bloods
            if (lastFetchTime === 0) {
                newBloods.forEach(blood => trackBlood(blood));
            } else {
                announceNewBloods(newBloods);
            }
            
            lastFetchTime = Date.now();
            bloodsData = newBloods;
            
            if (!silent) {
                renderBloods(bloodsData);
                generateBloodStats(bloodsData);
            }
            
            console.log(`初血 FIRST BLOODS LOADED: ${newBloods.length}`);
        } catch (error) {
            console.error('Error fetching data:', error);
            handleFetchError(silent);
        }
    }
    
    function trackBlood(blood) {
        if (!blood?.challenge_id) return;
        const teamId = blood.team_id || (blood.team?.id || 'unknown');
        knownSolves.add(`${blood.challenge_id}-${teamId}`);
    }
    
    function handleFetchError(silent) {
        if (!silent) {
            scoreboardBody.innerHTML = `
                <tr class="error-row">
                    <td colspan="4">
                        Error loading data. 
                        <button onclick="fetchBloods(false)" class="samurai-btn">Retry</button>
                    </td>
                </tr>
            `;
        }
    }
    
    function announceNewBloods(newBloods) {
        if (!Array.isArray(newBloods)) {
            console.warn('Invalid bloods data:', newBloods);
            return;
        }
        
        const newBloodsFound = [];
        
        newBloods.forEach(blood => {
            if (!blood?.challenge_id) return;
            
            const teamId = blood.team_id || (blood.team?.id || 'unknown');
            const bloodId = `${blood.challenge_id}-${teamId}`;
            
            if (!knownSolves.has(bloodId)) {
                knownSolves.add(bloodId);
                if (isRecentBlood(blood)) {
                    newBloodsFound.push(blood);
                }
            }
        });
        
        if (newBloodsFound.length > 0) {
            console.log(`🔊 NEW FIRST BLOODS: ${newBloodsFound.length} 🔊`);
            showBloodIndicator();
            newBloodsFound.forEach(createAnnouncement);
        }
    }
    
    function isRecentBlood(blood) {
        const solveTime = new Date(blood.date || Date.now());
        return (Date.now() - solveTime) <= 900000; // 15 minutes
    }
    
    function createBloodAnnouncement(blood) {
        // Create announcement element
        const announcement = document.createElement('div');
        announcement.className = 'blood-announcement';
        
        // Format time
        const date = new Date(blood.date || new Date());
        const timeString = date.toLocaleTimeString();
        
        // Safely get values with fallbacks
        const teamName = getTeamName(blood);
        const challengeName = blood.challenge_name || blood.name || 'Unknown Challenge';
        const points = blood.value || blood.points || 0;
        
        announcement.innerHTML = `
            <div class="announcement-content">
                <div class="announcement-header">
                    <span class="blood-emoji">🩸</span> FIRST BLOOD!
                </div>
                <div class="announcement-body">
                    <div class="team-name">${teamName}</div>
                    <div class="challenge-name">${challengeName}</div>
                    <div class="challenge-points">${points} points</div>
                    <div class="solve-time">${timeString}</div>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(announcement);
        
        // Remove after animation
        setTimeout(() => {
            announcement.classList.add('fade-out');
            setTimeout(() => {
                announcement.remove();
            }, 1000);
        }, 5000);
    }
    
    // Function to show a visual indicator when blood is detected
    function showBloodIndicator() {
        // Create a visual indicator element
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 5px;
            background-color: red;
            z-index: 9999;
            animation: pulse 1s ease-in-out 3;
        `;
        
        // Add keyframe animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        // Add to document
        document.body.appendChild(indicator);
        
        // Remove after animation
        setTimeout(() => {
            indicator.remove();
        }, 3000);
    }
    
    function renderBloods(data) {
        if (!data || data.length === 0) {
            scoreboardBody.innerHTML = `
                <tr>
                    <td colspan="4">No first blood data available</td>
                </tr>
            `;
            return;
        }
        
        // Clear the table
        scoreboardBody.innerHTML = '';
        
        // Render each first blood
        data.forEach((blood) => {
            // Skip invalid entries
            if (!blood) return;
            
            const row = document.createElement('tr');
            
            // Get values with fallbacks
            const challengeName = blood.challenge_name || blood.name || 'Unknown Challenge';
            const category = blood.category || 'Unknown Category';
            const teamName = getTeamName(blood);
            
            // Format the time
            let solveTime = 'Unknown Time';
            if (blood.date) {
                try {
                    const date = new Date(blood.date);
                    solveTime = date.toLocaleString();
                } catch (e) {
                    console.error('Error formatting date:', e);
                }
            }
            
            row.innerHTML = `
                <td>${challengeName}</td>
                <td>${category}</td>
                <td>${teamName}</td>
                <td>${solveTime}</td>
            `;
            
            scoreboardBody.appendChild(row);
        });
    }
    
    function generateBloodStats(bloods) {
        const statsContainer = document.getElementById('blood-stats');
        
        if (!statsContainer) {
            console.warn('Stats container not found');
            return;
        }
        
        // Clear the container
        statsContainer.innerHTML = '';
        
        if (!bloods || !Array.isArray(bloods) || bloods.length === 0) {
            statsContainer.innerHTML = '<div class="no-stats">No blood statistics available</div>';
            return;
        }
        
        // Group bloods by team
        const teamBloods = {};
        
        bloods.forEach(blood => {
            if (!blood) return;
            
            // Get team name with improved helper function
            const teamName = getTeamName(blood);
            
            if (!teamBloods[teamName]) {
                teamBloods[teamName] = [];
            }
            
            teamBloods[teamName].push(blood);
        });
        
        // If no teams were found (due to missing data)
        if (Object.keys(teamBloods).length === 0) {
            statsContainer.innerHTML = '<div class="no-stats">No valid team data found in blood statistics</div>';
            return;
        }
        
        // Sort teams by blood count (descending)
        const sortedTeams = Object.keys(teamBloods).sort((a, b) => 
            teamBloods[b].length - teamBloods[a].length
        );
        
        // Create the stats header
        const statsHeader = document.createElement('div');
        statsHeader.className = 'stats-header';
        statsHeader.innerHTML = `
            <h3>Team Blood Counts</h3>
            <p>Teams with the most first bloods</p>
        `;
        statsContainer.appendChild(statsHeader);
        
        // Create the stats grid
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stats-grid';
        
        // Create a card for each team
        sortedTeams.forEach(teamName => {
            const teamData = teamBloods[teamName];
            const card = document.createElement('div');
            card.className = 'team-stats';
            
            // Sort challenges by time (oldest first)
            teamData.sort((a, b) => {
                try {
                    return new Date(a.date || 0) - new Date(b.date || 0);
                } catch (e) {
                    return 0;
                }
            });
            
            // Safe challenge listing function
            const createChallengeList = (challenges) => {
                return challenges.map(blood => {
                    const challengeName = blood.challenge_name || blood.name || 'Unknown Challenge';
                    const category = blood.category || 'Unknown Category';
                    return `
                        <li>
                            <span class="challenge-name">${challengeName}</span>
                            <span class="challenge-category">${category}</span>
                        </li>
                    `;
                }).join('');
            };
            
            // Create the card content
            card.innerHTML = `
                <div class="team-stats-header">
                    <div class="team-name-header">${teamName}</div>
                    <div class="blood-count" title="${teamData.length} first bloods">🩸 ${teamData.length}</div>
                </div>
                <ul class="challenge-list">
                    ${createChallengeList(teamData)}
                </ul>
            `;
            
            // Add to the grid
            statsGrid.appendChild(card);
        });
        
        // Add the grid to the container
        statsContainer.appendChild(statsGrid);
    }
    
    // Helper function to extract team name from various response formats
    function getTeamName(blood) {
        if (!blood) return 'Unknown Team';
        
        // Check all possible places where team name might be
        if (typeof blood.team === 'string' && blood.team) {
            return blood.team;
        }
        
        if (blood.team_name && typeof blood.team_name === 'string') {
            return blood.team_name;
        }
        
        if (blood.team && typeof blood.team === 'object') {
            if (blood.team.name) return blood.team.name;
        }
        
        if (blood.user_name && typeof blood.user_name === 'string') {
            return blood.user_name;
        }
        
        if (blood.user && typeof blood.user === 'object' && blood.user.name) {
            return blood.user.name;
        }
        
        if (blood.solved_by && typeof blood.solved_by === 'object' && blood.solved_by.name) {
            return blood.solved_by.name;
        }
        
        if (blood.account && typeof blood.account === 'object' && blood.account.name) {
            return blood.account.name;
        }
        
        // Fallback to generic names with IDs if available
        if (blood.team_id) return `Team ${blood.team_id}`;
        if (blood.user_id) return `User ${blood.user_id}`;
        
        return 'Unknown Team';
    }
}); 