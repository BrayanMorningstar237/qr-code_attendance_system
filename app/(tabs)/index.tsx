import { Redirect } from 'expo-router';

export default function TabsIndex() {
  // This will immediately redirect to the login screen when the app opens
  return <Redirect href="/login" />;
}