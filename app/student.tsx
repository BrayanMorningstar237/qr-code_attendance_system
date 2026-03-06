import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from '@react-navigation/native'; // added for back button
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import firebase from "firebase/compat/app";
import jsQR from 'jsqr';
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Image as RNImage,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebase";

type Tab = "mycourses" | "browse" | "scanner";

type Course = {
  id: string;
  code: string;
  name: string;
  teacherName?: string;
};

type Session = {
  id: string;
  courseCode: string;
  dateTime: string;
  duration: number;
  location: {
    type: "gps" | "manual";
    latitude?: number;
    longitude?: number;
    radius?: number;
    address?: string;
    name?: string;
  };
  teacherId: string;
  createdAt: any;
};

type Attendance = {
  id: string;
  sessionId: string;
  studentId: string;
  timestamp: any;
};

export default function StudentScreen() {
  const router = useRouter();
  const navigation = useNavigation(); // added
  const [activeTab, setActiveTab] = useState<Tab>("mycourses");
  const [loading, setLoading] = useState(false);

  // Camera permissions and state
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanned, setScanned] = useState(false);

  // Location permissions and current position
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Data states
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  // Attendance stats per course
  const [courseStats, setCourseStats] = useState<Map<string, { attended: number; total: number }>>(new Map());

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locationStatus === "granted");
    })();
  }, []);

  // Fetch data based on active tab
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        console.log("No authenticated user");
        return;
      }

      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        const userData = userDoc.data();
        const enrolledIds = userData?.enrolledCourses || [];

        const coursesSnapshot = await db.collection("courses").get();
        const allCoursesData = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        setAllCourses(allCoursesData);

        if (enrolledIds.length > 0) {
          const enrolledCoursesData = allCoursesData.filter((c) => enrolledIds.includes(c.id));
          setEnrolledCourses(enrolledCoursesData);
        }

        const attendanceSnapshot = await db
          .collection("attendance")
          .where("studentId", "==", user.uid)
          .get();
        const attendanceData = attendanceSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Attendance[];
        setAttendance(attendanceData);

        const sessionsSnapshot = await db.collection("sessions").get();
        const sessionsData = sessionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Session[];
        setSessions(sessionsData);
      } catch (error) {
        console.error("Error fetching data:", error);
        Alert.alert("Error", "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Recompute course stats when relevant data changes
  useEffect(() => {
    const stats = new Map<string, { attended: number; total: number }>();
    enrolledCourses.forEach((course) => {
      const courseSessions = sessions.filter((s) => s.courseCode === course.code);
      const total = courseSessions.length;
      const attended = attendance.filter((a) =>
        courseSessions.some((s) => s.id === a.sessionId)
      ).length;
      stats.set(course.id, { attended, total });
    });
    setCourseStats(stats);
  }, [enrolledCourses, attendance, sessions]);

  // Helper to get current location (updated to handle null accuracy)
  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number; accuracy?: number } | null> => {
    if (!locationPermission) {
      Alert.alert("Location Required", "Please enable location permissions to mark attendance.");
      return null;
    }
    try {
      setGettingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude, accuracy } = location.coords;
      setCurrentLocation({ latitude, longitude });
      // Convert null to undefined to match return type
      return { latitude, longitude, accuracy: accuracy ?? undefined };
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert("Location Error", "Could not get your current location. Please try again.");
      return null;
    } finally {
      setGettingLocation(false);
    }
  };

  // Process QR data (updated location validation)
  const processQRData = async (qrData: string) => {
    setScanned(true);
    setShowCamera(false);

    try {
      const parsed = JSON.parse(qrData);
      if (!parsed.sessionId) {
        Alert.alert("Invalid QR", "This QR code does not contain a valid session ID");
        return;
      }

      const sessionDoc = await db.collection("sessions").doc(parsed.sessionId).get();
      if (!sessionDoc.exists) {
        Alert.alert("Invalid Session", "This session does not exist.");
        return;
      }
      const session = { id: sessionDoc.id, ...sessionDoc.data() } as Session;

      const existing = await db
        .collection("attendance")
        .where("studentId", "==", auth.currentUser?.uid)
        .where("sessionId", "==", session.id)
        .get();
      if (!existing.empty) {
        Alert.alert("Already Marked", "You have already marked attendance for this session.");
        return;
      }

      const now = new Date();
      const sessionStart = new Date(session.dateTime);
      const sessionEnd = new Date(sessionStart.getTime() + session.duration * 60000);
      if (now < sessionStart) {
        Alert.alert("Too Early", "This session hasn't started yet.");
        return;
      }
      if (now > sessionEnd) {
        Alert.alert("Too Late", "This session has already ended.");
        return;
      }

      if (session.location.type === "gps") {
        const studentLocation = await getCurrentLocation();
        if (!studentLocation) return;

        const distance = calculateDistance(
          studentLocation.latitude,
          studentLocation.longitude,
          session.location.latitude!,
          session.location.longitude!
        );

        const radius = session.location.radius || 200; // default to 200m
        const accuracy = studentLocation.accuracy || 0;
        const effectiveRadius = radius + accuracy;

        if (distance > effectiveRadius) {
          Alert.alert(
            "Location Mismatch",
            `You are ${Math.round(distance)}m away from the class location (GPS accuracy ±${Math.round(accuracy)}m). Must be within ${radius}m.`
          );
          return;
        }
      } else {
        Alert.alert("Location Not Available", "This session does not have GPS coordinates. Cannot verify your location.");
        return;
      }

      await db.collection("attendance").add({
        studentId: auth.currentUser!.uid,
        sessionId: session.id,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert("Success", "Attendance marked successfully");

      // Refresh attendance data
      const newAttendance = await db
        .collection("attendance")
        .where("studentId", "==", auth.currentUser!.uid)
        .get();
      setAttendance(newAttendance.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Attendance[]);
    } catch (error) {
      console.error("Error processing QR:", error);
      Alert.alert("Error", "Failed to process QR code.");
    }
  };

  // Calculate distance in meters (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // Camera scan handler
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanned) {
      processQRData(data);
    }
  };

  // Decode QR from image URI (native) – currently limited
  const decodeQRFromImage = async (uri: string) => {
    try {
      const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        RNImage.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
      });

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: (FileSystem as any).EncodingType.Base64,
      });

      Alert.alert('Notice', 'Gallery QR scanning on native devices is currently limited. Please use the camera for best results.');
    } catch (error) {
      console.error("Error decoding QR from image:", error);
      Alert.alert("Error", "Failed to decode QR code from image.");
    }
  };

  // Pick image from gallery
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant gallery access to select a QR code image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      base64: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      setGettingLocation(true);
      try {
        if (Platform.OS === 'web') {
          const base64 = result.assets[0].base64;
          if (!base64) {
            Alert.alert("Error", "Could not get image data.");
            return;
          }
          const img = new Image();
          img.src = `data:image/jpeg;base64,${base64}`;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const code = jsQR(imageData.data, img.width, img.height);
            if (code) {
              processQRData(code.data);
            } else {
              Alert.alert("No QR Code", "No QR code found in the selected image.");
            }
          }
        } else {
          await decodeQRFromImage(result.assets[0].uri);
        }
      } catch (error) {
        console.error("Error processing image:", error);
        Alert.alert("Error", "Failed to process image.");
      } finally {
        setGettingLocation(false);
      }
    }
  };

  const enrollCourse = async (courseId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    setEnrolling(courseId);
    try {
      const userRef = db.collection("users").doc(user.uid);
      await userRef.update({
        enrolledCourses: firebase.firestore.FieldValue.arrayUnion(courseId),
      });

      const userDoc = await userRef.get();
      const enrolledIds = userDoc.data()?.enrolledCourses || [];
      const enrolledCoursesData = allCourses.filter((c) => enrolledIds.includes(c.id));
      setEnrolledCourses(enrolledCoursesData);

      Alert.alert("Success", "Enrolled in course");
    } catch (error) {
      console.error("Error enrolling:", error);
      Alert.alert("Error", "Failed to enroll");
    } finally {
      setEnrolling(null);
    }
  };

  const renderMyCourses = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      );
    }

    if (enrolledCourses.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons name="school-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>You are not enrolled in any courses yet</Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => setActiveTab("browse")}>
            <Text style={styles.browseButtonText}>Browse Courses</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={enrolledCourses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const stats = courseStats.get(item.id) || { attended: 0, total: 0 };
          const progress = stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0;
          return (
            <View style={styles.courseCard}>
              <View style={styles.courseHeader}>
                <Text style={styles.courseCode}>{item.code}</Text>
                <Text style={styles.courseName}>{item.name}</Text>
              </View>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {stats.attended}/{stats.total} classes attended ({progress}%)
                </Text>
              </View>
            </View>
          );
        }}
      />
    );
  };

  const renderBrowseCourses = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      );
    }

    return (
      <FlatList
        data={allCourses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isEnrolled = enrolledCourses.some((c) => c.id === item.id);
          return (
            <View style={styles.courseCard}>
              <View style={styles.courseHeader}>
                <Text style={styles.courseCode}>{item.code}</Text>
                <Text style={styles.courseName}>{item.name}</Text>
              </View>
              <View style={styles.courseFooter}>
                <Text style={styles.teacherName}>{item.teacherName || "Unknown teacher"}</Text>
                {isEnrolled ? (
                  <View style={styles.enrolledBadge}>
                    <Ionicons name="checkmark-circle" size={20} color="#28a745" />
                    <Text style={styles.enrolledText}>Enrolled</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.enrollButton}
                    onPress={() => enrollCourse(item.id)}
                    disabled={enrolling === item.id}
                  >
                    {enrolling === item.id ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Text style={styles.enrollButtonText}>Enroll</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    );
  };

  const renderScanner = () => {
    if (locationPermission === null) {
      return (
        <View style={styles.centered}>
          <Text>Requesting location permission...</Text>
        </View>
      );
    }
    if (locationPermission === false) {
      return (
        <View style={styles.centered}>
          <Text>Location permission is required to verify attendance.</Text>
          <TouchableOpacity style={styles.button} onPress={() => Location.requestForegroundPermissionsAsync()}>
            <Text style={styles.buttonText}>Grant Location Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (showCamera) {
      if (!cameraPermission || !cameraPermission.granted) {
        return (
          <View style={styles.centered}>
            <Text>Camera permission required</Text>
            <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
              <Text style={styles.buttonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.scannerFull}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          <TouchableOpacity style={styles.closeScanner} onPress={() => setShowCamera(false)}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {scanned && (
            <TouchableOpacity style={styles.scanAgain} onPress={() => setScanned(false)}>
              <Text style={styles.scanAgainText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          )}
          {gettingLocation && (
            <View style={styles.locationOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.locationOverlayText}>Getting your location...</Text>
            </View>
          )}
        </View>
      );
    }

    // Options: camera or gallery
    return (
      <View style={styles.scannerFull}>
        <View style={styles.scannerOptions}>
          <TouchableOpacity style={styles.scannerOption} onPress={() => setShowCamera(true)}>
            <Ionicons name="camera-outline" size={40} color="#007AFF" />
            <Text style={styles.scannerOptionText}>Scan with Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scannerOption} onPress={pickImage}>
            <Ionicons name="image-outline" size={40} color="#007AFF" />
            <Text style={styles.scannerOptionText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
        {gettingLocation && (
          <View style={styles.locationOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.locationOverlayText}>Processing...</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            router.replace('/login');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Student Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "mycourses" && styles.activeTab]}
          onPress={() => setActiveTab("mycourses")}
        >
          <Ionicons name="library" size={20} color={activeTab === "mycourses" ? "#007AFF" : "#666"} />
          <Text style={[styles.tabText, activeTab === "mycourses" && styles.activeTabText]}>My Courses</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "browse" && styles.activeTab]}
          onPress={() => setActiveTab("browse")}
        >
          <Ionicons name="search" size={20} color={activeTab === "browse" ? "#007AFF" : "#666"} />
          <Text style={[styles.tabText, activeTab === "browse" && styles.activeTabText]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "scanner" && styles.activeTab]}
          onPress={() => setActiveTab("scanner")}
        >
          <Ionicons name="qr-code" size={20} color={activeTab === "scanner" ? "#007AFF" : "#666"} />
          <Text style={[styles.tabText, activeTab === "scanner" && styles.activeTabText]}>Scanner</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "mycourses" && renderMyCourses()}
      {activeTab === "browse" && renderBrowseCourses()}
      {activeTab === "scanner" && renderScanner()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: "#e6f2ff",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
    marginBottom: 20,
    textAlign: "center",
  },
  browseButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
  },
  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  courseHeader: {
    marginBottom: 12,
  },
  courseCode: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  courseName: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    textAlign: "right",
  },
  courseFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  teacherName: {
    fontSize: 14,
    color: "#666",
  },
  enrolledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  enrolledText: {
    fontSize: 14,
    color: "#28a745",
    fontWeight: "500",
  },
  enrollButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 60,
    alignItems: "center",
  },
  enrollButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  scannerFull: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerOptions: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  scannerOption: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    minWidth: 140,
  },
  scannerOptionText: {
    fontSize: 14,
    color: "#007AFF",
    marginTop: 8,
    textAlign: "center",
  },
  closeScanner: {
    position: "absolute",
    top: 40,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    padding: 5,
    zIndex: 10,
  },
  scanAgain: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 10,
  },
  scanAgainText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  locationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  locationOverlayText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});