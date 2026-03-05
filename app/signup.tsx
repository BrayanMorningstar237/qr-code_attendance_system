import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import firebase from "firebase/compat/app";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../firebase";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [matricule, setMatricule] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    // Basic validation
    if (!email || !password || !name) {
      Alert.alert("Error", "Please fill all required fields");
      console.log("Signup failed: missing required fields", { email, password, name });
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      console.log("Signup failed: passwords do not match");
      return;
    }
    if (role === "student" && !matricule) {
      Alert.alert("Error", "Matricule is required for students");
      console.log("Signup failed: matricule missing for student");
      return;
    }

    setLoading(true);
    console.log("Starting signup process for email:", email);

    try {
      // 1. Create user in Firebase Authentication
      console.log("Attempting to create user with email:", email);
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      if (!user) {
        console.error("User creation returned null");
        throw new Error("User creation failed – no user object returned");
      }

      console.log("User created successfully with UID:", user.uid);

      // 2. Save additional user data in Firestore
      const userData = {
        email,
        name,
        role,
        ...(role === "student" && { matricule }),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      console.log("Saving user data to Firestore:", userData);

      await db.collection("users").doc(user.uid).set(userData);
      console.log("Firestore document created for user:", user.uid);

      Alert.alert("Success", "Account created! Please log in.");
      router.replace("/login");
    } catch (error: any) {
      console.error("Signup error details:", {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });

      // User-friendly error messages
      if (error.code === "auth/email-already-in-use") {
        Alert.alert("Signup Failed", "This email is already registered. Please use a different email or log in.");
      } else if (error.code === "auth/weak-password") {
        Alert.alert("Signup Failed", "Password is too weak. Please use at least 6 characters.");
      } else if (error.code === "auth/invalid-email") {
        Alert.alert("Signup Failed", "Invalid email address.");
      } else {
        Alert.alert("Signup Failed", error.message || "An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
      console.log("Signup process completed.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="John Doe"
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email *</Text>
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
        <Text style={styles.label}>Password *</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Confirm Password *</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Role *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={role}
            onValueChange={(itemValue) => setRole(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Student" value="student" />
            <Picker.Item label="Teacher" value="teacher" />
            <Picker.Item label="Admin" value="admin" />
          </Picker>
        </View>
      </View>

      {role === "student" && (
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Matricule (e.g., FE23A001) *</Text>
          <TextInput
            style={styles.input}
            placeholder="FE23A001"
            value={matricule}
            onChangeText={setMatricule}
            autoCapitalize="characters"
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.signupButton}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.signupButtonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/login")} disabled={loading}>
        <Text style={styles.loginText}>
          Already have an account? Log in
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
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
  pickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
  },
  picker: {
    height: 50,
    width: "100%",
  },
  signupButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 10,
  },
  signupButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  loginText: {
    textAlign: "center",
    color: "#007AFF",
    marginTop: 20,
    fontSize: 16,
  },
});