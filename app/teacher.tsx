import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from 'expo-file-system';
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import firebase from "firebase/compat/app";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { auth, db } from "../firebase";

// Type definitions
type Course = {
  id: string;
  code: string;
  name: string;
  teacherId: string;
};

type Session = {
  id: string;
  courseCode: string;
  dateTime: string;
  duration: number;
  location: any;
  teacherId: string;
  createdAt: any;
};

export default function TeacherScreen() {
  const router = useRouter();
  const qrCodeRef = useRef<any>(null);

  // Form states
  const [selectedCourse, setSelectedCourse] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [duration, setDuration] = useState("");
  const [radius, setRadius] = useState("100");
  const [qrValue, setQrValue] = useState("");

  // Location states
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Courses assigned to teacher
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Sessions history
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch courses assigned to this teacher
  useEffect(() => {
    const fetchCourses = async () => {
      const user = auth.currentUser;
      if (!user) {
        console.log("No authenticated user");
        return;
      }
      console.log("Fetching courses for teacher:", user.uid);
      try {
        const snapshot = await db
          .collection("courses")
          .where("teacherId", "==", user.uid)
          .get();
        const coursesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        console.log(`Fetched ${coursesData.length} courses`);
        setCourses(coursesData);
        if (coursesData.length > 0) {
          setSelectedCourse(coursesData[0].code);
        }
      } catch (error) {
        console.error("Error fetching courses:", error);
        Alert.alert("Error", "Failed to load your courses");
      } finally {
        setLoadingCourses(false);
      }
    };

    fetchCourses();
  }, []);

  // Fetch sessions for this teacher
  const fetchSessions = async () => {
    const user = auth.currentUser;
    if (!user) return;
    console.log("Fetching sessions for teacher:", user.uid);
    try {
      const snapshot = await db
        .collection("sessions")
        .where("teacherId", "==", user.uid)
        .orderBy("createdAt", "desc")
        .get();
      const sessionsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Session[];
      console.log(`Fetched ${sessionsData.length} sessions`);
      setSessions(sessionsData);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      Alert.alert("Error", "Failed to load session history");
    }
  };

  // Initial load + refresh
  useEffect(() => {
    fetchSessions();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  // Location permission and fetch
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationStatus("Permission to access location was denied");
      }
    })();
  }, []);

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    setLocationStatus("Getting location...");
    try {
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      const address = geocode[0]
        ? `${geocode[0].street}, ${geocode[0].city}`
        : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      setCurrentLocation({ latitude, longitude, address });
      setUseCurrentLocation(true);
      setLocationStatus(`Location: ${address}`);
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert("Error", "Failed to get current location");
      setLocationStatus("");
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Generate QR and save session
  const generateQr = async () => {
  console.log("=== Starting QR generation ===");
  console.log("Input values:", {
    selectedCourse,
    dateTime,
    duration,
    useCurrentLocation,
    manualLocation,
    radius,
    currentLocation,
  });

  // Validation
  if (!selectedCourse || !dateTime || !duration) {
    console.log("Validation failed: missing required fields");
    Alert.alert("Error", "Please fill all required fields");
    return;
  }
  if (!useCurrentLocation && !manualLocation) {
    console.log("Validation failed: no location provided");
    Alert.alert("Error", "Please enter a location or use current location");
    return;
  }

  // Build location data
  let locationData;
  if (useCurrentLocation && currentLocation) {
    locationData = {
      type: "gps",
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      radius: parseInt(radius) || 100,
      address: currentLocation.address,
    };
    console.log("Using GPS location:", locationData);
  } else {
    locationData = {
      type: "manual",
      name: manualLocation,
      radius: parseInt(radius) || 100,
    };
    console.log("Using manual location:", locationData);
  }

  const user = auth.currentUser;
  if (!user) {
    console.log("No authenticated user");
    Alert.alert("Error", "You must be logged in");
    return;
  }
  console.log("Current user UID:", user.uid);

  const sessionData = {
    courseCode: selectedCourse,
    dateTime,
    duration: parseInt(duration),
    location: locationData,
    teacherId: user.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  console.log("Session data to save:", sessionData);

  try {
    console.log("Attempting to save session to Firestore...");
    const docRef = await db.collection("sessions").add(sessionData);
    console.log("✅ Session saved successfully with ID:", docRef.id);

    // Include session ID in QR payload
    const qrPayload = JSON.stringify({ sessionId: docRef.id, ...sessionData });
    setQrValue(qrPayload);
    console.log("QR payload generated");

    // Refresh sessions list
    fetchSessions();
  } catch (error: any) {
    console.error("🔥 Firestore add error:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    Alert.alert("Error", `Failed to save session: ${error.message}`);
  }
  console.log("=== QR generation finished ===");
};

  // Share QR code image
  // Share QR code image
const shareQR = async () => {
  if (!qrValue || !qrCodeRef.current) {
    Alert.alert("Error", "No QR code to share");
    return;
  }

  try {
    qrCodeRef.current.toDataURL(async (dataURL: string) => {
      const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
      // Use type assertion to bypass TypeScript errors
      const fileUri = (FileSystem as any).documentDirectory + `qr_${Date.now()}.png`;
      await (FileSystem as any).writeAsStringAsync(fileUri, base64Data, {
        encoding: (FileSystem as any).EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Sharing not available", "Cannot share on this device");
      }
    });
  } catch (error) {
    console.error("Error sharing QR:", error);
    Alert.alert("Error", "Failed to share QR code");
  }
};

  const renderSessionItem = ({ item }: { item: Session }) => (
    <View style={styles.sessionItem}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionCourse}>{item.courseCode}</Text>
        {/* Temporarily removed attendees count */}
      </View>
      <Text style={styles.sessionDetails}>
        {item.dateTime} • {item.location?.address || item.location?.name || "Unknown location"}
      </Text>
    </View>
  );

  if (loadingCourses) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  if (courses.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Teacher Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="school-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>No courses assigned to you yet</Text>
          <Text style={styles.emptySubtext}>Contact your admin to assign courses</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teacher Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Generate New QR</Text>

          {/* Course Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Course</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedCourse}
                onValueChange={(itemValue) => setSelectedCourse(itemValue)}
                style={styles.picker}
              >
                {courses.map((course) => (
                  <Picker.Item
                    key={course.id}
                    label={`${course.code} - ${course.name}`}
                    value={course.code}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date & Time</Text>
            <TextInput
              style={styles.input}
              placeholder="2025-03-06 10:00"
              value={dateTime}
              onChangeText={setDateTime}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="90"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />
          </View>

          {/* Location Options */}
          <View style={styles.locationSection}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.locationToggle}>
              <TouchableOpacity
                style={[styles.toggleButton, useCurrentLocation && styles.toggleButtonActive]}
                onPress={() => setUseCurrentLocation(true)}
              >
                <Ionicons
                  name="locate"
                  size={20}
                  color={useCurrentLocation ? "#fff" : "#007AFF"}
                />
                <Text style={[styles.toggleText, useCurrentLocation && styles.toggleTextActive]}>
                  Current Location
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !useCurrentLocation && styles.toggleButtonActive]}
                onPress={() => setUseCurrentLocation(false)}
              >
                <Ionicons name="map" size={20} color={!useCurrentLocation ? "#fff" : "#007AFF"} />
                <Text style={[styles.toggleText, !useCurrentLocation && styles.toggleTextActive]}>
                  Enter Manually
                </Text>
              </TouchableOpacity>
            </View>

            {useCurrentLocation ? (
              <View style={styles.currentLocationBox}>
                {currentLocation ? (
                  <View style={styles.locationInfo}>
                    <Ionicons name="checkmark-circle" size={24} color="#28a745" />
                    <Text style={styles.locationAddress}>{currentLocation.address}</Text>
                  </View>
                ) : (
                  <Text style={styles.locationHint}>Tap "Get Current Location" to use GPS</Text>
                )}
                <TouchableOpacity
                  style={styles.getLocationButton}
                  onPress={getCurrentLocation}
                  disabled={isGettingLocation}
                >
                  {isGettingLocation ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <>
                      <Ionicons name="navigate" size={20} color="#007AFF" />
                      <Text style={styles.getLocationText}>Get Current Location</Text>
                    </>
                  )}
                </TouchableOpacity>
                {locationStatus ? <Text style={styles.locationStatus}>{locationStatus}</Text> : null}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="e.g., Room 203, Hall A"
                value={manualLocation}
                onChangeText={setManualLocation}
              />
            )}
          </View>

          {/* Radius */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Verification Radius (meters)</Text>
            <TextInput
              style={styles.input}
              placeholder="100"
              value={radius}
              onChangeText={setRadius}
              keyboardType="numeric"
            />
            <Text style={styles.hint}>Students must be within this radius of the location</Text>
          </View>

          <TouchableOpacity style={styles.generateButton} onPress={generateQr}>
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
            <Text style={styles.generateButtonText}>Generate QR Code</Text>
          </TouchableOpacity>

          {qrValue ? (
            <View style={styles.qrContainer}>
              <Text style={styles.qrLabel}>Scan this QR:</Text>
              <QRCode
                value={qrValue}
                size={200}
                getRef={(ref) => (qrCodeRef.current = ref)}
              />
              <TouchableOpacity style={styles.shareButton} onPress={shareQR}>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.shareButtonText}>Share QR Code</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Previous Sessions */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Previous Sessions</Text>
          {loadingSessions ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <FlatList
              data={sessions}
              renderItem={renderSessionItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.historyList}
              ListEmptyComponent={<Text style={styles.emptyListText}>No sessions yet</Text>}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: "#fff",
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  pickerContainer: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
  },
  picker: {
    height: 50,
    width: "100%",
  },
  hint: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  locationSection: {
    marginBottom: 16,
  },
  locationToggle: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007AFF",
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: "#007AFF",
  },
  toggleText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  toggleTextActive: {
    color: "#fff",
  },
  currentLocationBox: {
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#b8e0ff",
  },
  locationInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  locationAddress: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  locationHint: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  getLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  getLocationText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  locationStatus: {
    fontSize: 12,
    color: "#28a745",
    marginTop: 4,
    textAlign: "center",
  },
  generateButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  qrContainer: {
    alignItems: "center",
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
  },
  qrLabel: {
    fontSize: 16,
    marginBottom: 12,
    color: "#333",
  },
  shareButton: {
    backgroundColor: "#34C759",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    width: "100%",
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  historySection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  historyList: {
    paddingBottom: 20,
  },
  sessionItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sessionCourse: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  sessionDetails: {
    fontSize: 14,
    color: "#666",
  },
  emptyListText: {
    textAlign: "center",
    color: "#999",
    fontSize: 16,
    marginTop: 20,
  },
});