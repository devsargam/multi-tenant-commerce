import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Placeholder from "./pages/Placeholder";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/orders" element={<Placeholder title="Orders" />} />
        <Route path="/customers" element={<Placeholder title="Customers" />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
    </Layout>
  );
}
