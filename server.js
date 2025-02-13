require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

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
      console.log(`🔍 Fetching data for team: ${team}`);

      const response = await axios.get(
        `https://www.nitrotype.com/api/v2/teams/${team}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
          },
        }
      );

      console.log(`✅ API Response for ${team}:`, JSON.stringify(response.data, null, 2));

      if (!response.data.results) {
        console.error(`❌ No 'results' in API response for team ${team}`);
        continue;
      }

      const teamInfo = response.data.results.info;
      const members = response.data.results.members;

      for (let player of members) {
        console.log(`👤 Processing player: ${player.username}`);

        await pool.query(
          `INSERT INTO player_stats
          (teamID, teamName, userID, racesPlayed, avgSpeed, lastLogin, played, secs, typed, errs, joinStamp, lastActivity, role, username, displayName, membership, title, carID, carHueAngle, status, highestSpeed)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (userID, teamID)
          DO UPDATE SET
          racesPlayed = EXCLUDED.racesPlayed,
          avgSpeed = EXCLUDED.avgSpeed,
          lastLogin = EXCLUDED.lastLogin,
          played = EXCLUDED.played,
          secs = EXCLUDED.secs,
          typed = EXCLUDED.typed,
          errs = EXCLUDED.errs,
          lastActivity = EXCLUDED.lastActivity,
          status = EXCLUDED.status,
          highestSpeed = EXCLUDED.highestSpeed;`,
          [
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
            player.highestSpeed,
          ]
        );
      }
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
cron.schedule("*/10 * * * *", fetchData);

// Run initial tests
testSupabaseConnection();
fetchData();

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
