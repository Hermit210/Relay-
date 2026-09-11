import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Home } from "./pages/Home";
import { LiveDemo } from "./pages/LiveDemo";
import { HowItWorks } from "./pages/HowItWorks";
import { Safety } from "./pages/Safety";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/demo" element={<LiveDemo />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/safety" element={<Safety />} />
      </Routes>
    </BrowserRouter>
  );
}
