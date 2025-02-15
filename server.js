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
    timeZone: "Asia/Kolkata",
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };

  const now = new Date();
  return new Intl.DateTimeFormat("en-GB", options).format(now);
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
    const response = await axios.get(
      `https://www.nitrotype.com/api/v2/teams/${team}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://www.nitrotype.com",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
      }
    );
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `⚠️ Request failed for ${team}, retrying in ${delay / 1000} seconds...`
      );
      await new Promise((res) => setTimeout(res, delay));
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

    const values = members.map((player) => [
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
      new Date(), // Current timestamp
    ]);

    const query = format(
      `
      INSERT INTO player_stats (
        teamID, teamName, userID, racesPlayed, avgSpeed, lastLogin, played, secs, typed, errs,
        joinStamp, lastActivity, role, username, displayName, membership, title, carID, carHueAngle,
        status, highestSpeed
      )
      VALUES %L
    `,
      values
    );

    await pool.query(query);
    console.log(`${getISTTime()} ✅ Successfully inserted ${members.length} players for team: ${team}`);
  }
  console.log("✅ Data for all teams saved successfully!");
}

// Schedule polling every 5 minutes
cron.schedule("*/10 * * * *", fetchData);

// API Endpoint: Processed Player Stats
app.get("/processed-players", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT userID, username, teamName, MIN(racesPlayed) AS start_races,
             MAX(racesPlayed) AS latest_races,
             MIN(typed) AS start_typed, MAX(typed) AS latest_typed,
             MIN(errs) AS start_errs, MAX(errs) AS latest_errs,
             MIN(secs) AS start_secs, MAX(secs) AS latest_secs
      FROM player_stats
      GROUP BY userID, username, teamName
    `);

    const processedPlayers = rows.map((player) => ({
      userID: player.userid,
      username: player.username,
      team: player.teamname,
      racesPlayed: player.latest_races - player.start_races,
      avgWPM: (player.latest_typed - player.start_typed) /
              (player.latest_secs - player.start_secs) * 12,
      accuracy: 100 - ((player.latest_errs - player.start_errs) /
                      (player.latest_typed - player.start_typed)) * 100,
    }));

    res.json(processedPlayers);
  } catch (error) {
    console.error("❌ Error processing player stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Keep-alive endpoint for uptime monitoring
app.get("/", (req, res) => res.send("✅ Server is alive!"));

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Run initial tests
testSupabaseConnection();
