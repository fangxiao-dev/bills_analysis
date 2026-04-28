import { Navigate, Route, Routes } from "react-router-dom";
import { BillUploadPage } from "../features/upload/pages/BillUploadPage";
import { ManualReviewPage } from "../features/upload/pages/ManualReviewPage";
import { StatisticsPage } from "../features/statistics/pages/StatisticsPage";

/**
 * Top-level route map for the frontend shell.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<BillUploadPage />} />
      <Route path="/manual-review" element={<ManualReviewPage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      <Route path="/archive" element={<Navigate to="/" replace />} />
      <Route path="/settings" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
