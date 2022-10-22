const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let database = null;
const initializeDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3019, () => {
      console.log("Server is running at http;//localhost:3019");
    });
  } catch (err) {
    console.log(`DB Error: ${err.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// convert format of columns of the tables into to response format

const convertStateTable = (stateOb) => {
  return {
    stateId: stateOb.state_id,
    stateName: stateOb.state_name,
    population: stateOb.population,
  };
};

const convertDistrictTable = (districtOb) => {
  return {
    districtId: districtOb.district_id,
    districtName: districtOb.district_name,
    stateId: districtOb.state_id,
    cases: districtOb.cases,
    cured: districtOb.cured,
    active: districtOb.active,
    deaths: districtOb.deaths,
  };
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user 
    WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    //user does not exist
    response.status(400);
    response.send("Invalid user");
  } else {
    //login in to account and get jwt token
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "mySecretCode");
      response.send({ jwtToken: jwtToken });
    } else {
      // send incorrect password as response
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.header("authorization");
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    //send unauthorized status
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "mySecretCode", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API to get list of all states

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesListQuery = `
    SELECT * FROM state;`;
  const statesList = await database.all(getStatesListQuery);
  response.send(statesList.map((eachState) => convertStateTable(eachState)));
});

//API to get a state based on the state ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * FROM state WHERE state_id = ${stateId};`;
  const state = await database.get(getStateQuery);
  response.send(convertStateTable(state));
});

//API to create a district in the district table
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
    INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
    VALUES ('${districtName}',${stateId},${cases},${cured},
    ${active},${deaths});`;

  await database.run(createDistrictQuery);
  response.send("District Successfully Added");
});

// API to get a district based on the district ID
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT * FROM district WHERE district_id = ${districtId};`;
    const district = await database.get(getDistrictQuery);
    response.send(convertDistrictTable(district));
  }
);

//API to Delete a district from the district table
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `
DELETE FROM district WHERE district_id =${districtId};`;
    await database.run(deleteQuery);
    response.send("District Removed");
  }
);
//API to update the details of a specific district
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const getUpdateQuery = `
    UPDATE district 
    SET district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
   active = ${active},
   deaths = ${deaths}
   WHERE district_id = ${districtId};`;
    await database.run(getUpdateQuery);
    response.send("District Details Updated");
  }
);

//API to get the statistics  of covid19
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatsQuery = `
    SELECT SUM(cases),SUM(cured),SUM(active),SUM(deaths)
    FROM district
    WHERE state_id = ${stateId};`;
    const stats = await database.get(getStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
