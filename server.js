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
const TEAMS = process.env.TEAMS.split(",");

// Fetch and store data for all teams
async function fetchData() {
  try {
    for (const team of TEAMS) {
      const response = await axios.get(`https://www.nitrotype.com/api/v2/teams/${team}`);
      const teamInfo = response.data.results.info;
      const members = response.data.results.members;

      for (let player of members) {
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
    console.error("❌ Error fetching or saving data:", error.message);
  }
}

// Schedule polling every 10 minutes
cron.schedule("*/10 * * * *", fetchData);
fetchData();

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
