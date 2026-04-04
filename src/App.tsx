import React from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Main from "./routes/Main";

const App: React.FC<{}> = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Main view="" />} />
        <Route path="/home" element={<Main view="" />} />
        <Route path="/scores" element={<Main view="scores" />} />
        <Route path="/analytics" element={<Main view="analytics" />} />
        <Route path="/drill" element={<Main view="drill" />} />
        <Route path="/profile" element={<Main view="profile" />} />
        <Route path="/account" element={<Main view="account" />} />
      </Routes>
    </Router>
  );
};

export default App;
