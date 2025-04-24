document.addEventListener('DOMContentLoaded', function() {
    // Constants
    const FIRSTBLOODS_API_URL = '/api/firstbloods'; // New dedicated endpoint
    const MOCK_MODE = false; // Set to true if CTFd API is unreachable
    
    // DOM Elements
    const scoreboardBody = document.getElementById('scoreboard-body');
    const refreshBtn = document.getElementById('refresh-btn');
    const bloodSoundElement = document.getElementById('blood-sound-element');
    
    // State
    let bloodsData = [];
    let knownSolves = new Set(); // Track solves we've already seen
    let lastFetchTime = 0;
    let soundEnabled = false;
    
    // Enable sound on user interaction (required by most browsers)
    function enableSound() {
        if (soundEnabled) return;
        
        // Try to play a silent sound to enable audio
        if (bloodSoundElement) {
            const silentPlay = bloodSoundElement.play();
            if (silentPlay) {
                silentPlay.then(() => {
                    console.log('Audio playback enabled by user interaction');
                    bloodSoundElement.pause();
                    bloodSoundElement.currentTime = 0;
                    soundEnabled = true;
                }).catch(e => {
                    console.warn('Could not enable audio yet:', e);
                });
            }
        }
    }
    
    // Enable sound on various user interactions
    document.addEventListener('click', enableSound, { once: false });
    document.addEventListener('keydown', enableSound, { once: false });
    document.addEventListener('touchstart', enableSound, { once: false });
    
    // Initialize
    console.log('Blood announcer initialized');
    fetchBloods(false);  // Initial load with UI update
    
    // Set up polling
    function setupPolling() {
        console.log('Setting up polling - checking for blood every 5 seconds');
        // Check for new bloods every 5 seconds
        setInterval(() => fetchBloods(true), 5 * 1000);
        
        // Full UI refresh every minute
        setInterval(() => fetchBloods(false), 60 * 1000);
    }
    
    // Start polling after initial load
    setupPolling();
    
    // Event Listeners
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            fetchBloods(false);
        });
    }
    
    // Functions
    async function fetchBloods(silent = false) {
        if (!silent) {
            // Show loading state if not silent refresh
            scoreboardBody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="4">Loading first blood data...</td>
                </tr>
            `;
        }
        
        try {
            // Use the dedicated first bloods endpoint
            const url = MOCK_MODE ? '/api/mock/solves' : FIRSTBLOODS_API_URL;
            
            // Fetch the data
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch first bloods');
            }
            
            let newBloods = [];
            try {
                const data = await response.json();
                
                // Handle different response formats
                if (Array.isArray(data)) {
                    newBloods = data;
                } else if (data && typeof data === 'object') {
                    if (Array.isArray(data.data)) {
                        newBloods = data.data;
                    } else {
                        console.warn('Response has unexpected format:', data);
                        newBloods = [];
                    }
                }
            } catch (jsonError) {
                console.error('Error parsing JSON:', jsonError);
                throw new Error('Failed to parse response data');
            }
            
            // Process and update state with notifications
            const currentTime = Date.now();
            
            // For first time, just initialize known solves
            if (lastFetchTime === 0) {
                if (Array.isArray(newBloods)) {
                    newBloods.forEach(blood => {
                        if (blood && blood.challenge_id) {
                            const teamId = blood.team_id || (blood.team ? blood.team.id : 'unknown');
                            const bloodId = `${blood.challenge_id}-${teamId}`;
                            knownSolves.add(bloodId);
                        }
                    });
                }
            } 
            // For subsequent fetches, check for new bloods and notify
            else if (Array.isArray(newBloods)) {
                announceNewBloods(newBloods);
            }
            
            lastFetchTime = currentTime;
            
            // Update our state
            bloodsData = newBloods || [];
            
            // Only render if not silent refresh
            if (!silent) {
                renderBloods(bloodsData);
                generateBloodStats(bloodsData);
            }
            
            // Log success
            console.log(`
                ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ 
                初血 FIRST BLOODS LOADED: ${(newBloods || []).length}
                ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️
            `);
        } catch (error) {
            console.error('Error fetching data:', error);
            if (!silent) {
                scoreboardBody.innerHTML = `
                    <tr class="error-row">
                        <td colspan="4">
                            Error loading first blood data. Please check your connection or try again later.
                            <br><br>
                            <button id="retry-btn" class="samurai-btn">Retry</button>
                        </td>
                    </tr>
                `;
                
                // Add retry button functionality
                document.getElementById('retry-btn').addEventListener('click', () => fetchBloods(false));
            }
        }
    }
    
    function announceNewBloods(bloods) {
        // Ensure bloods is an array before trying to iterate
        if (!Array.isArray(bloods)) {
            console.warn('announceNewBloods received non-array data:', bloods);
            return;
        }
        
        let newBloodsFound = [];
        
        bloods.forEach(blood => {
            // Skip if blood object doesn't have required properties
            if (!blood || !blood.challenge_id || (!blood.team_id && !blood.team)) {
                return;
            }
            
            // Generate a unique ID for this blood
            const teamId = blood.team_id || (blood.team ? blood.team.id : 'unknown');
            const bloodId = `${blood.challenge_id}-${teamId}`;
            
            // Check if we've already seen this solve
            if (!knownSolves.has(bloodId)) {
                // Add to known solves
                knownSolves.add(bloodId);
                
                // Only add for announcement if it's recent (within last 15 minutes)
                const solveTime = new Date(blood.date || Date.now());
                const now = new Date();
                const minutesAgo = (now - solveTime) / (1000 * 60);
                
                if (minutesAgo <= 15) {
                    newBloodsFound.push(blood);
                }
            }
        });
        
        // Create announcements for new bloods
        if (newBloodsFound.length > 0) {
            console.log(`🔊 NEW FIRST BLOODS DETECTED: ${newBloodsFound.length} 🔊`);
            
            // Show visual indicator
            showBloodIndicator();
            
            // Play sound immediately when new bloods are found
            playDingSound();
            
            // Create visual notifications with slight delay between them
            newBloodsFound.forEach((blood, index) => {
                setTimeout(() => {
                    createBloodAnnouncement(blood);
                }, index * 500); // Show each notification with 500ms delay
            });
        }
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
    
    // Function to play a blood sound
    function playDingSound() {
        console.log('Playing blood sound');
        
        try {
            // Try to play the HTML audio element first
            if (bloodSoundElement) {
                bloodSoundElement.currentTime = 0;
                bloodSoundElement.volume = 0.7;
                
                const playPromise = bloodSoundElement.play();
                if (playPromise) {
                    playPromise.then(() => {
                        console.log('SUCCESS: Blood sound is playing!');
                    }).catch(error => {
                        console.error('Error playing blood sound from element:', error);
                        playAudioFromScratch();
                    });
                }
                return;
            }
            
            // Fallback to creating audio from scratch
            playAudioFromScratch();
            
        } catch (e) {
            console.error("Could not play blood sound:", e);
            playFallbackSound();
        }
    }
    
    // Create and play an audio element programmatically
    function playAudioFromScratch() {
        console.log('Trying to play sound from scratch');
        
        const audio = new Audio('/scoreboard/static/sounds/blood.mp3');
        audio.volume = 0.7;
        
        // Using both of these for broader browser support
        audio.muted = false;
        
        // Try to play
        const playPromise = audio.play();
        
        // Handle promise if supported
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('SUCCESS: Blood sound is playing from scratch!');
            }).catch(error => {
                console.error('Error playing blood sound from scratch:', error);
                
                // Try alternate paths
                tryNextPath([
                    'scoreboard/static/sounds/blood.mp3',
                    '/static/sounds/blood.mp3',
                    'static/sounds/blood.mp3',
                    '../scoreboard/static/sounds/blood.mp3'
                ], 0);
            });
        }
    }
    
    // Helper function to try multiple audio paths
    function tryNextPath(paths, index) {
        if (index >= paths.length) {
            console.error("All paths failed, using fallback sound");
            playFallbackSound();
            return;
        }
        
        const path = paths[index];
        console.log(`Trying path: ${path}`);
        
        const audioAlt = new Audio(path);
        audioAlt.volume = 0.7;
        audioAlt.play().catch(err => {
            console.error(`Failed with path ${path}:`, err);
            tryNextPath(paths, index + 1);
        });
    }
    
    // Fallback sound function using Web Audio API
    function playFallbackSound() {
        try {
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            
            // Create oscillator for the ding sound
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            // Connect nodes
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            // Set oscillator properties
            oscillator.type = 'sine';
            oscillator.frequency.value = 880; // A5 note
            
            // Set volume envelope
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            
            // Start and stop
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
            console.error("Could not play fallback sound:", e);
        }
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