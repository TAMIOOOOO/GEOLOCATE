// app/dashboard/page.js

// This is the file that renders the client components like DataDisplay or your main Home map
import ProtectedRoute from '@/components/ProtectedRoute'; 
import DataDisplay from './DataDisplay'; // or import your main map component (Home)

export default function DashboardPage() {
  return (
    // Wrap the entire content with the protection component
    <ProtectedRoute>
      <main>
        <DataDisplay />
        {/* Or <Home /> if your main app logic is there */}
      </main>
    </ProtectedRoute>
  );
}