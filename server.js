require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const cron = require("node-cron");
const format = require("pg-format");

const app = express();
const PORT = process.env.PORT || 3000;

// Function to get IST formatted time
function getISTTime() {
  const options = {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    millisecond: 'numeric'
  };

  const now = new Date();
  const istTime = new Intl.DateTimeFormat('en-GB', options).format(now);

  return istTime;
}

// Connect to Supabase PostgreSQL
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// Fetch team list from environment variable
const TEAMS = process.env.TEAMS ? process.env.TEAMS.split(",") : [];

async function testSupabaseConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to Supabase successfully!");
    client.release();
  } catch (error) {
    console.error("❌ Error connecting to Supabase:", error.message);
  }
}

// Function to fetch data with retries
async function fetchTeamData(team, retries = 3, delay = 5000) {
  try {
    console.log(`${getISTTime()} 🔍 Fetching data for team: ${team}`);
    const response = await axios.get(`https://www.nitrotype.com/api/v2/teams/${team}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
        "Referer": "https://www.nitrotype.com",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
      },
    });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.warn(`⚠️ Request failed for ${team}, retrying in ${delay / 1000} seconds...`);
      await new Promise(res => setTimeout(res, delay));
      return fetchTeamData(team, retries - 1, delay);
    } else {
      console.error(`❌ Failed to fetch data for ${team} after multiple attempts.`);
      return null;
    }
  }
}

// Fetch and store data for all teams
async function fetchData() {
  for (const team of TEAMS) {
    const data = await fetchTeamData(team);
    if (!data || !data.results) continue;

    const teamInfo = data.results.info;
    const members = data.results.members;

    if (members.length === 0) continue;

    const values = members.map(player => [
      teamInfo.teamID, teamInfo.name, player.userID, player.racesPlayed,
      player.avgSpeed, player.lastLogin, player.played, player.secs,
      player.typed, player.errs, player.joinStamp, player.lastActivity,
      player.role, player.username, player.displayName, player.membership,
      player.title, player.carID, player.carHueAngle, player.status, player.highestSpeed
    ]);

    const query = format(`
      INSERT INTO player_stats (
        teamID, teamName, userID, racesPlayed, avgSpeed, lastLogin, played, secs, typed, errs,
        joinStamp, lastActivity, role, username, displayName, membership, title, carID, carHueAngle,
        status, highestSpeed
      )
      VALUES %L
    `, values);

    await pool.query(query);
    console.log(`${getISTTime()} ✅ Successfully inserted ${members.length} players for team: ${team}`);

    // await new Promise(res => setTimeout(res, 10000)); // Add 10-second delay between requests
  }
  console.log("✅ Data for all teams saved successfully!");
}

// Schedule polling every 10 minutes
cron.schedule("*/1 * * * *", fetchData);

// Run initial tests
testSupabaseConnection();

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
