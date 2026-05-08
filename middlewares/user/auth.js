const jwt = require("jsonwebtoken");
const User=require("../../models/user/User");

exports.isAuthenticated = async (req, res, next) => {
    try {
      const { token } = req.cookies; 
  
      if (!token) {
        return res.status(401).json({ message: "Please login to continue" });
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET); 
  
      if (!decoded) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
  
      req.user = await User.findById(decoded.id);
      if (!req.user) {
        return res.status(404).json({ message: "Account Deactivated" });
      }
  
      next(); // Allow access to the next middleware 
    } catch (error) {
      console.log("Authentication error:", error);
      return res.status(500).json({ message: "Authentication failed" });
    }
  };
  