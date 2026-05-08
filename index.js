require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const cors = require("cors");
const cloudinary = require("cloudinary");
const app = express();
const connectDB = require("./db/database");

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json({ limit: "100mb" }));
app.use(cookieParser());
app.use("/", express.static("uploads"));
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));

connectDB();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const user=require("./controllers/User")
const hR=require("./controllers/HelpRequests")
const rTH=require("./controllers/RespondToReqs")
const kH=require("./controllers/Kyn")
const chat=require("./controllers/Chat")
const admin=require("./controllers/Admin")


app.use("/api/user",user);
app.use("/api/hR",hR);
app.use("/api/rTH",rTH);
app.use("/api/kH",kH);
app.use("/api/chat",chat);
app.use("/api/admin",admin);



app.get("/", (req, res) => {
  return res.status(200).send("Hello, World!");
});
app.all(/.*/, (req, res) => {
  return res
    .status(404)
    .json({ message: `Route ${req.originalUrl} not found` });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});