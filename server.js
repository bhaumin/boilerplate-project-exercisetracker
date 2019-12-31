const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const MongoDB = require("mongodb");
const MongoClient = MongoDB.MongoClient;
const ObjectID = MongoDB.ObjectID;

require("dotenv").config();

const app = express();

const uri = process.env.MLAB_URI;
const dbName = process.env.DB_NAME;

console.log(uri, dbName);

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Connect the MongoDB server
(async () => {
  try {
    await client.connect();
    // console.log("Connected to the DB server");
  } catch (err) {
    console.log(err.stack);
  }
})();


app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});


app.post("/api/exercise/new-user", async (req, res, next) => {
  try {
    const username = req.body.username.trim();
    const result = await createNewUser(username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});


app.get("/api/exercise/users", async (req, res, next) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});


app.post("/api/exercise/add", async (req, res, next) => {
  try {
    const userId = req.body.userId.trim();
    const description = req.body.description.trim();
    const duration = parseInt(req.body.duration.trim());
    const inputDate = req.body.date.trim();
    const date = inputDate ? new Date(inputDate) : new Date();

    const user = await getUserByUserId(userId);
    await addExercise(userId, description, duration, date);
    const response = { username: user.username, _id: userId, description, duration, date: date.toDateString() };
    res.json(response);
  } catch (err) {
    next(err);
  }
});


app.get("/api/exercise/log", async (req, res, next) => {
  try {
    const userId = req.query.userId.trim();
    const fromDateStr = req.query.from ? req.query.from.trim() : "";
    const toDateStr = req.query.to ? req.query.to.trim() : "";
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(toDateStr) : null;
    const limitStr = req.query.limit ? req.query.limit.trim() : "";
    const limit = limitStr ? parseInt(limitStr) : null;

    const user = await getUserByUserId(userId);
    const exerciseLog = await getExerciseLog(userId, fromDate, toDate, limit);
    formatDates(exerciseLog);
    const response = { _id: user._id, username: user.username, count: exerciseLog.length, log: exerciseLog };
    res.json(response);
  } catch (err) {
    next(err);
  }
});


// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "not found" });
});


// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});


// Implementation

async function createNewUser(username) {
  try {
    const existingUser = await getUserByUsername(username);

    if (existingUser && existingUser._id) {
      return { _id: existingUser._id, username: existingUser.username };
    }

    const db = client.db(dbName);
    const users = db.collection("users");
    const result = await users.insertOne({ username: username });
    return { _id: result.insertedId, username: username };
  } catch (err) {
    throw err;
  }
}


async function getUserByUsername(username) {
  const db = client.db(dbName);
  const users = db.collection("users");

  try {
    return await users.findOne({ username: username });
  } catch (err) {
    throw err;
  }
}


async function getUserByUserId(userId) {
  const db = client.db(dbName);
  const users = db.collection("users");

  try {
    const user = await users.findOne({ _id: ObjectID(userId) });
    return user;
  } catch (err) {
    throw err;
  }
}


async function getAllUsers() {
  const db = client.db(dbName);
  const users = db.collection("users");

  try {
    const result = await users.find();
    return await result.toArray();
  } catch (err) {
    throw err;
  }
}


async function addExercise(userId, description, duration, date) {
  const db = client.db(dbName);
  const exerciseLog = db.collection("exerciselog");

  try {
    return await exerciseLog.insertOne({ userId: userId, description: description, duration: duration, date: date});
  } catch (err) {
    throw err;
  }
}


async function getExerciseLog(userId, fromDate, toDate, limit) {
  const db = client.db(dbName);
  const exerciseLog = db.collection("exerciselog");

  try {
    const qry = { userId: userId };
    const options = { projection: { _id: 0, description: 1, duration: 1, date: 1 } };

    if (fromDate && toDate) {
      qry["date"] = { $gte: fromDate, $lte: toDate };
    } else if (fromDate) {
      qry["date"] = { $gte: fromDate };
    } else if (toDate) {
      qry["date"] = { $lte: toDate };
    }

    if (limit) {
      options["limit"] = limit;
    }

    const result = await exerciseLog.find(qry, options);
    return await result.toArray();
  } catch (err) {
    throw err;
  }
}


function formatDates(log) {
  log.forEach((n, i, arr) => arr[i]["date"] = arr[i]["date"].toDateString());
}
