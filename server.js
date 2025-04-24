const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CTFD_URL = 'https://airtech.aucssociety.com';

// CTFd credentials
const CTFD_USERNAME = 'admin';
const CTFD_PASSWORD = 'FFWbT_V_78Dd13';

// Set default timeout and handle rate limiting
axios.defaults.timeout = 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/scoreboard/static', express.static(path.join(__dirname, 'scoreboard', 'static')));

// Cache for teams and challenges data
let teamsCache = null;
let challengesCache = null;

// Function to get authentication cookie
let authCookie = null;
async function getAuthCookie() {
    if (authCookie) return authCookie;
    
    try {
        console.log('Getting new auth cookie...');
        
        // First, get CSRF token
        const csrfResponse = await axios.get(`${CTFD_URL}/login`, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'User-Agent': 'SamuraiBloodAnnouncer/1.0'
            }
        });
        
        // Extract CSRF token from response
        const csrfMatch = csrfResponse.data.match(/name="nonce"[^>]*value="([^"]+)"/);
        if (!csrfMatch) {
            throw new Error('Could not extract CSRF token');
        }
        const csrfToken = csrfMatch[1];
        
        // Get cookies from response
        const cookies = csrfResponse.headers['set-cookie'];
        if (!cookies) {
            throw new Error('No cookies in response');
        }
        
        // Now login with the CSRF token
        const loginResponse = await axios.post(
            `${CTFD_URL}/login`, 
            `name=${CTFD_USERNAME}&password=${CTFD_PASSWORD}&_submit=Submit&nonce=${csrfToken}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'SamuraiBloodAnnouncer/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                    'Cookie': cookies.join('; ')
                },
                maxRedirects: 0,
                validateStatus: status => status >= 200 && status < 400
            }
        );
        
        // Get authentication cookie from response
        const authCookies = loginResponse.headers['set-cookie'];
        if (!authCookies) {
            throw new Error('No authentication cookies in response');
        }
        
        authCookie = authCookies.join('; ');
        console.log('Authentication successful');
        return authCookie;
    } catch (error) {
        console.error('Authentication error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
        throw error;
    }
}

// Function to handle CTFd API requests with proper authentication
async function ctfdApiRequest(endpoint) {
    try {
        // Get authentication cookie
        const cookie = await getAuthCookie();
        
        // Make API request with authentication
        const response = await axios.get(`${CTFD_URL}${endpoint}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SamuraiBloodAnnouncer/1.0',
                'Content-Type': 'application/json',
                'Cookie': cookie
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            
            // If authentication expired, reset the cookie and try again
            if (error.response.status === 401 || error.response.status === 403) {
                authCookie = null;
                // Try one more time
                return ctfdApiRequest(endpoint);
            }
        }
        throw error;
    }
}

// Function to get all teams
async function getTeams() {
    if (teamsCache) return teamsCache;
    
    try {
        console.log('Fetching teams data...');
        const teamsMap = {};
        
        // First try teams endpoint
        try {
            const teamsData = await ctfdApiRequest('/api/v1/teams');
            
            // Create a map of team ID to team name
            teamsData.data.forEach(team => {
                teamsMap[team.id] = team.name;
            });
            
            console.log(`Cached ${Object.keys(teamsMap).length} teams from teams endpoint`);
            
            // If we got teams, use them
            if (Object.keys(teamsMap).length > 0) {
                teamsCache = teamsMap;
                return teamsMap;
            }
        } catch (teamsError) {
            console.warn('Failed to get teams from teams endpoint:', teamsError.message);
        }
        
        // If teams endpoint failed or returned no teams, try scoreboard
        try {
            const scoreboardData = await ctfdApiRequest('/api/v1/scoreboard');
            
            // Create a map of team ID to team name from scoreboard
            scoreboardData.data.forEach(standing => {
                if (standing.team) {
                    teamsMap[standing.team.id] = standing.team.name;
                } else if (standing.name) {
                    // Some CTFd instances just include name directly 
                    teamsMap[standing.account_id] = standing.name;
                }
            });
            
            console.log(`Cached ${Object.keys(teamsMap).length} teams from scoreboard endpoint`);
            
            // If we got teams, use them
            if (Object.keys(teamsMap).length > 0) {
                teamsCache = teamsMap;
                return teamsMap;
            }
        } catch (scoreboardError) {
            console.warn('Failed to get teams from scoreboard:', scoreboardError.message);
        }
        
        // If scoreboard failed or returned no teams, try users endpoint as last resort
        try {
            const usersData = await ctfdApiRequest('/api/v1/users');
            
            // Create a map of user ID to user name
            usersData.data.forEach(user => {
                teamsMap[user.id] = user.name;
            });
            
            console.log(`Cached ${Object.keys(teamsMap).length} users as fallback`);
            
            // If we got users, use them
            if (Object.keys(teamsMap).length > 0) {
                teamsCache = teamsMap;
                return teamsMap;
            }
        } catch (usersError) {
            console.warn('Failed to get users:', usersError.message);
        }
        
        // If all methods failed, return empty map
        console.warn('Failed to get teams or users from any endpoint');
        teamsCache = teamsMap;
        return teamsMap;
        
    } catch (error) {
        console.error('Error fetching teams/users:', error.message);
        throw error;
    }
}

// Function to get all challenges
async function getChallenges() {
    if (challengesCache) return challengesCache;
    
    try {
        console.log('Fetching challenges data...');
        const challengesData = await ctfdApiRequest('/api/v1/challenges');
        
        // Create a map of challenge ID to challenge details
        const challengesMap = {};
        challengesData.data.forEach(challenge => {
            challengesMap[challenge.id] = challenge;
        });
        
        challengesCache = challengesMap;
        console.log(`Cached ${Object.keys(challengesMap).length} challenges`);
        return challengesMap;
    } catch (error) {
        console.error('Error fetching challenges:', error.message);
        throw error;
    }
}

// Helper function to get team name from solve object with improved reliability
function getTeamNameFromSolve(solve, teamsMap) {
    // Try all possible sources for team name in priority order
    if (solve.team && solve.team.name) {
        return solve.team.name;
    }
    
    if (solve.solved_by && solve.solved_by.name) {
        return solve.solved_by.name;
    }
    
    if (solve.team_name) {
        return solve.team_name;
    }
    
    if (solve.team_id && teamsMap[solve.team_id]) {
        return teamsMap[solve.team_id];
    }
    
    if (solve.user && solve.user.name) {
        return solve.user.name;
    }
    
    if (solve.user_name) {
        return solve.user_name;
    }
    
    if (solve.user_id && teamsMap[solve.user_id]) {
        return teamsMap[solve.user_id];
    }
    
    if (solve.account && solve.account.name) {
        return solve.account.name;
    }
    
    // Fallback
    return solve.team_id ? `Team ${solve.team_id}` : 
           solve.user_id ? `User ${solve.user_id}` : 'Unknown Team';
}

// Endpoint to get all challenges
app.get('/api/challenges', async (req, res) => {
    try {
        const challenges = await getChallenges();
        res.json({
            success: true,
            data: Object.values(challenges)
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch challenge data',
            message: error.message
        });
    }
});

// Enhanced endpoint to get all solves with team names and challenge details
app.get('/api/solves', async (req, res) => {
    try {
        // Get the raw solves data
        const solvesData = await ctfdApiRequest('/api/v1/submissions?type=correct');
        
        // Get teams and challenges
        const teams = await getTeams();
        const challenges = await getChallenges();
        
        // Enhance each solve with team name and challenge details
        const enhancedSolves = solvesData.data.map(solve => {
            const challenge = challenges[solve.challenge_id] || {};
            const teamName = getTeamNameFromSolve(solve, teams);
            
            return {
                ...solve,
                team_name: teamName,
                challenge_name: challenge.name || 'Unknown Challenge',
                category: challenge.category || 'Unknown Category',
                value: challenge.value || 0
            };
        });
        
        res.json({
            success: true,
            data: enhancedSolves
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch solve data',
            message: error.message
        });
    }
});

// Endpoint to get first solves (bloods)
app.get('/api/firstbloods', async (req, res) => {
    try {
        console.log("Fetching first bloods data...");
        
        // Get fresh submissions data directly from CTFd API
        const submissionsResponse = await ctfdApiRequest('/api/v1/submissions?type=correct');
        
        if (!submissionsResponse || !submissionsResponse.data) {
            console.error("No submissions data returned from API:", submissionsResponse);
            return res.status(500).json({ error: 'Failed to fetch submissions' });
        }
        
        // Get challenges and teams data for enrichment
        const challenges = await getChallenges();
        const teams = await getTeams();
        
        // Group solves by challenge_id to find first blood for each
        const challengeSolves = {};
        
        submissionsResponse.data.forEach(solve => {
            const challengeId = solve.challenge_id;
            
            if (!challengeSolves[challengeId] || new Date(solve.date) < new Date(challengeSolves[challengeId].date)) {
                challengeSolves[challengeId] = solve;
            }
        });
        
        // Format response with challenge details and team names
        const firstBloods = Object.values(challengeSolves).map(solve => {
            const challenge = challenges[solve.challenge_id] || {};
            
            return {
                id: solve.challenge_id,
                name: challenge.name || `Challenge ${solve.challenge_id}`,
                category: challenge.category || 'Unknown',
                value: challenge.value || 0,
                team_id: solve.team_id || solve.user_id,
                team: getTeamNameFromSolve(solve, teams),
                date: solve.date,
                raw_solve: solve // Include for debugging
            };
        });
        
        // Sort by date
        firstBloods.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        console.log(`Returning ${firstBloods.length} first bloods`);
        res.json(firstBloods);
    } catch (error) {
        console.error("Error in firstbloods endpoint:", error);
        res.status(500).json({
            error: 'Failed to fetch first bloods',
            message: error.message
        });
    }
});

// Get all teams
app.get('/api/teams', async (req, res) => {
    try {
        const teams = await getTeams();
        res.json({
            success: true,
            data: Object.entries(teams).map(([id, name]) => ({ id, name }))
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch teams data',
            message: error.message
        });
    }
});

// Get scoreboard
app.get('/api/scoreboard', async (req, res) => {
    try {
        const data = await ctfdApiRequest('/api/v1/scoreboard');
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch scoreboard data',
            message: error.message
        });
    }
});

// Mock API for testing if CTFd API is unreachable
app.get('/api/mock/challenges', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, name: "Intro Challenge", category: "Web", value: 100 },
            { id: 2, name: "Hidden Flag", category: "Crypto", value: 200 },
            { id: 3, name: "Buffer Overflow", category: "Pwn", value: 300 },
            { id: 4, name: "Reverse Me", category: "Reverse", value: 250 },
            { id: 5, name: "SQL Injection", category: "Web", value: 150 }
        ]
    });
});

app.get('/api/mock/solves', (req, res) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    res.json({
        success: true,
        data: [
            { challenge_id: 1, team_name: "Samurai Warriors", date: twoHoursAgo.toISOString() },
            { challenge_id: 2, team_name: "Binary Ninjas", date: oneHourAgo.toISOString() },
            { challenge_id: 3, team_name: "Samurai Warriors", date: now.toISOString() },
            { challenge_id: 4, team_name: "Hack Masters", date: oneHourAgo.toISOString() },
            { challenge_id: 1, team_name: "Binary Ninjas", date: twoHoursAgo.toISOString() }
        ]
    });
});

// Reset cache endpoint (for admin use)
app.post('/api/reset-cache', (req, res) => {
    teamsCache = null;
    challengesCache = null;
    authCookie = null;
    
    res.json({
        success: true,
        message: 'Cache reset successfully'
    });
});

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get all detailed submissions directly
app.get('/api/detail-submissions', async (req, res) => {
    try {
        // Extract the raw data directly without processing
        const data = await ctfdApiRequest('/api/v1/submissions?type=correct');
        
        // Add some debugging information
        if (data.data && data.data.length > 0) {
            console.log('Sample submission object properties:', Object.keys(data.data[0]));
            
            // Check for nested properties that might contain team or user info
            const sample = data.data[0];
            if (sample.user) console.log('User property:', sample.user);
            if (sample.team) console.log('Team property:', sample.team);
            if (sample.solved_by) console.log('Solved_by property:', sample.solved_by);
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch detailed submission data',
            message: error.message
        });
    }
});

// Utility endpoint to debug submission data structure (development only)
app.get('/api/debug-structure', async (req, res) => {
    try {
        // Get a submission and examine its structure
        const solvesData = await ctfdApiRequest('/api/v1/submissions?type=correct');
        
        if (!solvesData.data || solvesData.data.length === 0) {
            return res.json({
                success: false,
                message: 'No submissions found'
            });
        }
        
        const sample = solvesData.data[0];
        
        // Extract the field names and types
        const structure = {
            fields: Object.keys(sample),
            dataTypes: {},
            nestedFields: {}
        };
        
        // Check the data type of each field
        Object.entries(sample).forEach(([key, value]) => {
            structure.dataTypes[key] = typeof value;
            
            // If it's an object, include its keys too
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                structure.nestedFields[key] = Object.keys(value);
            }
        });
        
        // Include the full raw first item for reference
        structure.rawSample = sample;
        
        res.json({
            success: true,
            data: structure,
            message: 'This endpoint shows the structure of submissions from the CTFd API'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch and analyze submission structure',
            message: error.message
        });
    }
});

// Comprehensive debugging endpoint to check all relevant API data
app.get('/api/debug', async (req, res) => {
    try {
        const result = {
            status: 'Running diagnostic checks',
            checks: {}
        };
        
        // Check teams endpoint
        try {
            const teamsData = await ctfdApiRequest('/api/v1/teams');
            result.checks.teams = {
                success: true,
                count: teamsData.data ? teamsData.data.length : 0,
                sample: teamsData.data && teamsData.data.length > 0 ? teamsData.data[0] : null,
                message: 'Teams API accessible'
            };
        } catch (error) {
            result.checks.teams = {
                success: false,
                error: error.message,
                message: 'Failed to access teams API'
            };
        }
        
        // Check scoreboard endpoint
        try {
            const scoreboardData = await ctfdApiRequest('/api/v1/scoreboard');
            result.checks.scoreboard = {
                success: true,
                count: scoreboardData.data ? scoreboardData.data.length : 0,
                sample: scoreboardData.data && scoreboardData.data.length > 0 ? scoreboardData.data[0] : null,
                message: 'Scoreboard API accessible'
            };
        } catch (error) {
            result.checks.scoreboard = {
                success: false,
                error: error.message,
                message: 'Failed to access scoreboard API'
            };
        }
        
        // Check challenges endpoint
        try {
            const challengesData = await ctfdApiRequest('/api/v1/challenges');
            result.checks.challenges = {
                success: true,
                count: challengesData.data ? challengesData.data.length : 0,
                sample: challengesData.data && challengesData.data.length > 0 ? challengesData.data[0] : null,
                message: 'Challenges API accessible'
            };
        } catch (error) {
            result.checks.challenges = {
                success: false,
                error: error.message,
                message: 'Failed to access challenges API'
            };
        }
        
        // Check submissions endpoint
        try {
            const submissionsData = await ctfdApiRequest('/api/v1/submissions?type=correct');
            result.checks.submissions = {
                success: true,
                count: submissionsData.data ? submissionsData.data.length : 0,
                sample: submissionsData.data && submissionsData.data.length > 0 ? submissionsData.data[0] : null,
                structure: submissionsData.data && submissionsData.data.length > 0 ? 
                    Object.keys(submissionsData.data[0]) : [],
                message: 'Submissions API accessible'
            };
            
            // Check first blood calculations
            if (submissionsData.data && submissionsData.data.length > 0) {
                // Get first submission for testing
                const testSolve = submissionsData.data[0];
                const teams = await getTeams();
                
                result.checks.firstBlood = {
                    challengeId: testSolve.challenge_id,
                    rawTeamId: testSolve.team_id,
                    rawUserId: testSolve.user_id,
                    calculatedTeamName: getTeamNameFromSolve(testSolve, teams),
                    allNameSources: {
                        fromAccount: testSolve.account?.name,
                        fromTeamObject: testSolve.team?.name,
                        fromSolvedBy: testSolve.solved_by?.name,
                        fromTeamName: testSolve.team_name,
                        fromTeamCache: testSolve.team_id ? teams[testSolve.team_id] : null,
                        fromUserObject: testSolve.user?.name,
                        fromUserCache: testSolve.user_id ? teams[testSolve.user_id] : null,
                        fromUserName: testSolve.user_name
                    }
                };
            }
        } catch (error) {
            result.checks.submissions = {
                success: false,
                error: error.message,
                message: 'Failed to access submissions API'
            };
        }
        
        // Evaluate results
        const allSuccess = Object.values(result.checks).every(check => check.success);
        result.overallStatus = allSuccess ? 'All checks passed' : 'Some checks failed';
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'Diagnostic check failed',
            message: error.message
        });
    }
});

// Sound test page (for debugging)
app.get('/test-sound', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sound Test</title>
        </head>
        <body>
            <h1>Sound Test Page</h1>
            <p>Click buttons to test different sound file paths:</p>
            
            <button onclick="playSound('/scoreboard/static/sounds/blood.mp3')">Play /scoreboard/static/sounds/blood.mp3</button><br><br>
            <button onclick="playSound('/static/sounds/blood.mp3')">Play /static/sounds/blood.mp3</button><br><br>
            <button onclick="playSound('static/sounds/blood.mp3')">Play static/sounds/blood.mp3</button><br><br>
            <button onclick="playSound('scoreboard/static/sounds/blood.mp3')">Play scoreboard/static/sounds/blood.mp3</button><br><br>
            
            <div id="status"></div>
            
            <script>
                function playSound(path) {
                    document.getElementById('status').textContent = 'Trying to play: ' + path;
                    
                    const audio = new Audio(path);
                    audio.volume = 0.7;
                    
                    audio.onplay = function() {
                        document.getElementById('status').textContent = 'SUCCESS: Playing ' + path;
                    };
                    
                    audio.onerror = function(e) {
                        document.getElementById('status').textContent = 'ERROR: Failed to play ' + path + ' - ' + e;
                    };
                    
                    audio.play().catch(error => {
                        document.getElementById('status').textContent = 'ERROR: ' + error;
                    });
                }
            </script>
        </body>
        </html>
    `);
});

// Start the server
app.listen(PORT, () => {
    console.log(`
    ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ 
    初血 SAMURAI BLOOD ANNOUNCER RUNNING ON PORT ${PORT}
    ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️ ⚔️
    `);
    
    // Initialize cache
    getTeams().catch(err => console.error('Failed to initialize teams cache:', err.message));
    getChallenges().catch(err => console.error('Failed to initialize challenges cache:', err.message));
}); 