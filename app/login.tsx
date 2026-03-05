import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../firebase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      console.log("Login failed: missing email/password");
      return;
    }

    setLoading(true);
    console.log("Attempting login with email:", email);

    try {
      // Sign in with Firebase Auth
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;
      console.log("Sign-in successful, user UID:", user?.uid);

      if (!user) {
        Alert.alert("Error", "No user data returned");
        console.error("User object is null after sign-in");
        setLoading(false);
        return;
      }

      // Fetch the user's role from Firestore
      console.log("Fetching user document from Firestore for UID:", user.uid);
      const userDoc = await db.collection("users").doc(user.uid).get();
      console.log("User doc exists:", userDoc.exists);

      if (userDoc.exists) {
        const userData = userDoc.data();
        const role = userData?.role;
        console.log("User role from Firestore:", role);

        if (!role) {
          Alert.alert("Error", "No role assigned to this user");
          console.error("Role missing in Firestore document");
          await auth.signOut();
          setLoading(false);
          return;
        }

        // Redirect based on role
        console.log("Redirecting to:", role);
        if (role === "admin") router.replace("/admin");
        else if (role === "teacher") router.replace("/teacher");
        else if (role === "student") router.replace("/student");
        else {
          Alert.alert("Error", "Invalid role");
          console.error("Invalid role value:", role);
          await auth.signOut();
        }
      } else {
        Alert.alert("Error", "User data not found in Firestore");
        console.error("No Firestore document for user:", user.uid);
        await auth.signOut();
      }
    } catch (error: any) {
      console.error("Login error details:", error.code, error.message);
      Alert.alert("Login Failed", error.message);
    } finally {
      setLoading(false);
      console.log("Login process completed.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance App</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      <TouchableOpacity
        style={styles.loginButton}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/signup")} disabled={loading}>
        <Text style={styles.signupText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  loginButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 10,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  signupText: {
    textAlign: "center",
    color: "#007AFF",
    marginTop: 20,
    fontSize: 16,
  },
});