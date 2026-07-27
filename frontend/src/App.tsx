import { BrowserRouter, Route, Routes } from "react-router-dom";
import Overview from "./pages/Overview";
import ClubDetail from "./pages/ClubDetail";

// BASE_URL is "/" on Cloudflare Pages; passing it as basename keeps routing
// correct if the app is ever served from a subpath.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <BrowserRouter basename={basename || "/"}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/club/:clubId" element={<ClubDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
