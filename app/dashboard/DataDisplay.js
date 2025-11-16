// app/dashboard/DataDisplay.js
'use client';

import { useEffect, useState } from 'react';
// Import client-side Auth for user interaction (e.g., checking login status)
import { auth } from '@/lib/firebase/client-config'; 

export default function DataDisplay() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Function to fetch data from the secure API Route Handler
  const fetchData = async () => {
    try {
      // Fetch data from the secure server-side endpoint
      const response = await fetch('/api/data'); 
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      // You can implement user feedback here
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Client-side authentication listener
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchData(); // Fetch data only if a user is logged in
      } else {
        setLoading(false);
      }
    });

    // Cleanup subscription on component unmount
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <p>Loading data...</p>;
  }

  if (!user) {
    return <h1>Please log in to view the dashboard.</h1>;
  }

  return (
    <div>
      <h1>User Dashboard</h1>
      <p>Logged in as: <strong>{user.email}</strong></p>
      <button onClick={() => auth.signOut()}>Logout</button>
      
      <h2>Securely Fetched Data (from Firestore via Admin SDK)</h2>
      {data.length > 0 ? (
        <ul>
          {data.map((item) => (
            <li key={item.id}>{JSON.stringify(item)}</li>
          ))}
        </ul>
      ) : (
        <p>No data found in the 'users' collection.</p>
      )}
    </div>
  );
}