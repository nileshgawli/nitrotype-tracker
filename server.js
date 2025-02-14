require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const cron = require("node-cron");
const format = require("pg-format"); // Import pg-format

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

// Fetch and store data for all teams
async function fetchData() {
  try {
    for (const team of TEAMS) {
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

      console.log(`✅ API Response for ${team}:`, JSON.stringify(response.data, null, 2));

      if (!response.data.results) {
        console.error(`❌ No 'results' in API response for team ${team}`);
        continue;
      }

      const teamInfo = response.data.results.info;
      const members = response.data.results.members;

      console.log(teamInfo);
      console.log(members);

      // Skip if no players found
      if (members.length === 0) continue;

      // Prepare data for batch insert
      const values = members.map(player => [
        teamInfo.teamID,
        teamInfo.name,
        player.userID,
        player.racesPlayed,
        player.avgSpeed,
        player.lastLogin,
        player.played,
        player.secs,
        player.typed,
        player.errs,
        player.joinStamp,
        player.lastActivity,
        player.role,
        player.username,
        player.displayName,
        player.membership,
        player.title,
        player.carID,
        player.carHueAngle,
        player.status,
        player.highestSpeed
      ]);

      // Use pg-format for batch insert
      const query = format(`
        INSERT INTO player_stats (
          teamID, teamName, userID, racesPlayed, avgSpeed, lastLogin, played, secs, typed, errs,
          joinStamp, lastActivity, role, username, displayName, membership, title, carID, carHueAngle,
          status, highestSpeed
        )
        VALUES %L
      `, values);

      // Execute batch insert
      await pool.query(query);
      console.log(`${getISTTime()} ✅ Successfully inserted ${members.length} players for team: ${team}`);
    }

    console.log("✅ Data for all teams saved successfully!");
  } catch (error) {
    console.error("❌ Error fetching or saving data:");
    if (error.response) {
      console.error(`Status Code: ${error.response.status}`);
      console.error(`Response Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

// Schedule polling every 10 minutes
cron.schedule("*/1 * * * *", fetchData);

// Run initial tests
testSupabaseConnection();

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
