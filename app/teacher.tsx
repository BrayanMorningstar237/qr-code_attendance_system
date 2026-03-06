import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Location from "expo-location";
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import firebase from "firebase/compat/app";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
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
import ViewShot from "react-native-view-shot";
import { auth, db } from "../firebase";

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

type Student = {
  id: string;
  name: string;
  email: string;
  matricule?: string;
  enrolledCourses?: string[];
};

export default function TeacherScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const qrCodeRef = useRef<any>(null);
  const viewShotRef = useRef<any>(null);

  // Form states
  const [selectedCourse, setSelectedCourse] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [duration, setDuration] = useState("");
  const [radius, setRadius] = useState("200");
  const [qrValue, setQrValue] = useState("");

  // Validation errors
  const [errors, setErrors] = useState({
    course: false,
    date: false,
    duration: false,
    location: false,
  });

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

  // Report modal
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedReportCourse, setSelectedReportCourse] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);

  // Compute end time
  const endTime = React.useMemo(() => {
    if (!duration) return null;
    const end = new Date(date);
    end.setMinutes(end.getMinutes() + parseInt(duration) || 0);
    return end;
  }, [date, duration]);

  // Clear a specific error when field is filled
  useEffect(() => {
    if (selectedCourse) setErrors(prev => ({ ...prev, course: false }));
  }, [selectedCourse]);

  useEffect(() => {
    if (date) setErrors(prev => ({ ...prev, date: false }));
  }, [date]);

  useEffect(() => {
    if (duration) setErrors(prev => ({ ...prev, duration: false }));
  }, [duration]);

  useEffect(() => {
    if ((useCurrentLocation && currentLocation) || (!useCurrentLocation && manualLocation)) {
      setErrors(prev => ({ ...prev, location: false }));
    }
  }, [useCurrentLocation, currentLocation, manualLocation]);

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

  // Validate form before generating QR
  const validateForm = () => {
    const newErrors = {
      course: !selectedCourse,
      date: !date,
      duration: !duration,
      location: (useCurrentLocation && !currentLocation) || (!useCurrentLocation && !manualLocation),
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(v => v);
  };

  // Generate QR and save session
  const generateQr = async () => {
    console.log("=== Starting QR generation ===");

    if (!validateForm()) {
      console.log("Validation failed");
      Alert.alert("Error", "Please fill all required fields");
      return;
    }

    const dateTimeStr = date.toISOString();

    let locationData;
    if (useCurrentLocation && currentLocation) {
      locationData = {
        type: "gps",
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        radius: parseInt(radius) || 200,
        address: currentLocation.address,
      };
    } else {
      locationData = {
        type: "manual",
        name: manualLocation,
        radius: parseInt(radius) || 200,
      };
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "You must be logged in");
      return;
    }

    const sessionData = {
      courseCode: selectedCourse,
      dateTime: dateTimeStr,
      duration: parseInt(duration),
      location: locationData,
      teacherId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      console.log("Saving session to Firestore...");
      const docRef = await db.collection("sessions").add(sessionData);
      console.log("Session saved with ID:", docRef.id);

      const qrPayload = JSON.stringify({ sessionId: docRef.id, ...sessionData });
      setQrValue(qrPayload);
      console.log("QR payload generated");

      fetchSessions();
    } catch (error: any) {
      console.error("Firestore add error:", error);
      Alert.alert("Error", `Failed to save session: ${error.message}`);
    }
  };

  // Share QR code image
  const shareQR = async () => {
    if (!qrValue || !qrCodeRef.current) {
      Alert.alert("Error", "No QR code to share");
      return;
    }

    try {
      qrCodeRef.current.toDataURL(async (dataURL: string) => {
        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");

        if (Platform.OS !== 'web') {
          const fs = FileSystem as any;
          if (!fs.documentDirectory) {
            Alert.alert("Error", "Cannot access file system");
            return;
          }

          const fileUri = fs.documentDirectory + `qr_${Date.now()}.png`;
          await fs.writeAsStringAsync(fileUri, base64Data, {
            encoding: fs.EncodingType?.Base64 || 'base64',
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
          } else {
            Alert.alert("Sharing not available", "Cannot share on this device");
          }
          return;
        }

        const blob = await (await fetch(dataURL)).blob();
        const file = new File([blob], `qr_${Date.now()}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Attendance QR Code',
              text: 'Scan this QR code to mark attendance',
            });
            return;
          } catch (shareError) {
            console.log('Web share failed, falling back to download', shareError);
          }
        }

        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `qr_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert("Success", "QR code downloaded");
      });
    } catch (error) {
      console.error("Error sharing QR:", error);
      Alert.alert("Error", "Failed to share QR code");
    }
  };

  const captureQRAsDataURL = (): Promise<string> => {
    return new Promise((resolve) => {
      if (qrCodeRef.current) {
        qrCodeRef.current.toDataURL(resolve);
      } else {
        resolve('');
      }
    });
  };

  const downloadImage = async () => {
    if (!qrValue || !viewShotRef.current) {
      Alert.alert("Error", "No QR code to download");
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const uri = await viewShotRef.current.capture();
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (permission.granted) {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert("Success", "Image saved to gallery");
        } else {
          Alert.alert("Permission denied", "Cannot save image");
        }
      } else {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          Alert.alert("Error", "Could not create canvas context");
          return;
        }
        canvas.width = 400;
        canvas.height = 500;

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Attendance QR Code', 20, 30);
        ctx.font = '14px Arial';
        ctx.fillText(`Course: ${selectedCourse}`, 20, 60);
        ctx.fillText(`Date & Time: ${date.toLocaleString()}`, 20, 90);
        ctx.fillText(`Duration: ${duration} min`, 20, 120);
        const locationText = `Location: ${
          useCurrentLocation && currentLocation
            ? currentLocation.address
            : manualLocation || 'Not specified'
        }`;
        ctx.fillText(locationText, 20, 150);
        ctx.fillStyle = '#dc3545';
        ctx.font = 'italic 12px Arial';
        ctx.fillText(`* Valid until ${endTime?.toLocaleTimeString()}`, 20, 180);

        const qrImage = new Image();
        const qrDataUrl = await captureQRAsDataURL();
        qrImage.src = qrDataUrl;
        await new Promise((resolve) => {
          qrImage.onload = () => {
            ctx.drawImage(qrImage, 100, 200, 200, 200);
            resolve(null);
          };
        });

        const link = document.createElement('a');
        link.download = `qr_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        Alert.alert("Success", "Image downloaded");
      }
    } catch (error) {
      console.error("Error downloading image:", error);
      Alert.alert("Error", "Failed to download image");
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to logout');
    }
  };

  // Generate attendance report for selected course
  const generateReport = async () => {
    if (!selectedReportCourse) {
      Alert.alert('Error', 'Please select a course');
      return;
    }
    setGeneratingReport(true);
    try {
      const course = courses.find(c => c.code === selectedReportCourse);
      if (!course) throw new Error('Course not found');

      // Get all students enrolled in this course
      const studentsSnapshot = await db.collection('users')
        .where('role', '==', 'student')
        .where('enrolledCourses', 'array-contains', course.id)
        .get();
      const students = studentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Student[];

      if (students.length === 0) {
        Alert.alert('No Students', 'No students are enrolled in this course.');
        setGeneratingReport(false);
        return;
      }

      // Get all sessions for this course (past and future)
      const sessionsSnapshot = await db.collection('sessions')
        .where('courseCode', '==', selectedReportCourse)
        .orderBy('dateTime', 'asc')
        .get();
      const sessions = sessionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Session[];

      if (sessions.length === 0) {
        Alert.alert('No Sessions', 'No sessions have been created for this course.');
        setGeneratingReport(false);
        return;
      }

      // Get all attendance records for these sessions
      const sessionIds = sessions.map(s => s.id);
      let attendance: any[] = [];
      if (sessionIds.length > 0) {
        // Firestore 'in' query supports up to 10 values; if more, we need to chunk.
        // For simplicity, we assume <=10 sessions. Otherwise, we'd need to batch.
        const attendanceSnapshot = await db.collection('attendance')
          .where('sessionId', 'in', sessionIds.slice(0, 10))
          .get();
        attendance = attendanceSnapshot.docs.map(doc => doc.data());
      }

      // Build CSV
      let csv = 'Student Name,Matricule,Email';
      sessions.forEach(s => {
        const date = new Date(s.dateTime).toLocaleDateString();
        csv += `,${date}`;
      });
      csv += '\n';

      students.forEach(student => {
        const name = student.name || '';
        const matricule = student.matricule || '';
        const email = student.email || '';
        let row = `"${name.replace(/"/g, '""')}",${matricule},${email}`;

        sessions.forEach(session => {
          const attended = attendance.some(a => a.studentId === student.id && a.sessionId === session.id);
          row += `,${attended ? 'Present' : 'Absent'}`;
        });
        csv += row + '\n';
      });

      // Save to file and share
      const fileUri = (FileSystem as any).documentDirectory + `attendance_${course.code}_${Date.now()}.csv`;
      await (FileSystem as any).writeAsStringAsync(fileUri, csv, {
        encoding: (FileSystem as any).EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Attendance' });
      } else {
        Alert.alert('Sharing not available', 'Cannot share file');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const renderSessionItem = ({ item }: { item: Session }) => (
    <View style={styles.sessionItem}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionCourse}>{item.courseCode}</Text>
      </View>
      <Text style={styles.sessionDetails}>
        {new Date(item.dateTime).toLocaleString()} • {item.location?.address || item.location?.name || "Unknown location"}
      </Text>
    </View>
  );

  const InfoImageView = () => {
    if (!qrValue) return null;
    return (
      <View style={styles.infoImageContainer}>
        <QRCode value={qrValue} size={180} />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoTitle}>Attendance QR Code</Text>
          <Text style={styles.infoText}>Course: {selectedCourse}</Text>
          <Text style={styles.infoText}>Date & Time: {date.toLocaleString()}</Text>
          <Text style={styles.infoText}>Duration: {duration} minutes</Text>
          <Text style={styles.infoText}>
            Location: {useCurrentLocation && currentLocation ? currentLocation.address : manualLocation}
          </Text>
          <Text style={styles.infoCondition}>
            * Valid until {endTime?.toLocaleTimeString()}
          </Text>
        </View>
      </View>
    );
  };

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
          <TouchableOpacity onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              router.replace('/login');
            }
          }}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Teacher Dashboard</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setReportModalVisible(true)} style={{ marginRight: 15 }}>
              <Ionicons name="document-text-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <Ionicons name="exit-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
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
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            router.replace('/login');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teacher Dashboard</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setReportModalVisible(true)} style={{ marginRight: 15 }}>
            <Ionicons name="document-text-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Ionicons name="exit-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>
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
            <View style={[styles.pickerContainer, errors.course && styles.errorBorder]}>
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
            {errors.course && <Text style={styles.errorText}>Please select a course</Text>}
          </View>

          {/* Date Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity 
              onPress={() => setShowDatePicker(true)} 
              style={[styles.pickerButton, errors.date && styles.errorBorder]}
            >
              <Text>{date.toDateString()}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) setDate(selectedDate);
                }}
              />
            )}
            {errors.date && <Text style={styles.errorText}>Please select a date</Text>}
          </View>

          {/* Time Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Time</Text>
            <TouchableOpacity 
              onPress={() => setShowTimePicker(true)} 
              style={[styles.pickerButton, errors.date && styles.errorBorder]}
            >
              <Text>{date.toLocaleTimeString()}</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={date}
                mode="time"
                display="default"
                onChange={(event, selectedTime) => {
                  setShowTimePicker(false);
                  if (selectedTime) setDate(selectedTime);
                }}
              />
            )}
            {errors.date && <Text style={styles.errorText}>Please select a time</Text>}
          </View>

          {/* Duration */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duration (minutes)</Text>
            <TextInput
              style={[styles.input, errors.duration && styles.errorBorder]}
              placeholder="120"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />
            {errors.duration && <Text style={styles.errorText}>Please enter duration</Text>}
            {endTime && !errors.duration && (
              <Text style={styles.hint}>Session ends at {endTime.toLocaleTimeString()}</Text>
            )}
          </View>

          {/* Location Options */}
          <View style={styles.locationSection}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.locationToggle}>
              <TouchableOpacity
                style={[styles.toggleButton, useCurrentLocation && styles.toggleButtonActive]}
                onPress={() => setUseCurrentLocation(true)}
              >
                <Ionicons name="locate" size={20} color={useCurrentLocation ? "#fff" : "#007AFF"} />
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
              <View style={[styles.currentLocationBox, errors.location && styles.errorBorder]}>
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
              <>
                <TextInput
                  style={[styles.input, errors.location && styles.errorBorder]}
                  placeholder="e.g., Room 203, Hall A"
                  value={manualLocation}
                  onChangeText={setManualLocation}
                />
              </>
            )}
            {errors.location && (
              <Text style={styles.errorText}>
                {useCurrentLocation ? 'Please get current location' : 'Please enter a location'}
              </Text>
            )}
          </View>

          {/* Radius */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Verification Radius (meters)</Text>
            <TextInput
              style={styles.input}
              placeholder="200"
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
            <View>
              <Text style={styles.qrLabel}>QR Code with Details:</Text>
              <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
                <InfoImageView />
              </ViewShot>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.shareButton} onPress={shareQR}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.downloadButton} onPress={downloadImage}>
                  <Ionicons name="download-outline" size={20} color="#fff" />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

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

      {/* Report Modal */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export Attendance</Text>
            <Text style={styles.modalLabel}>Select Course</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedReportCourse}
                onValueChange={(itemValue) => setSelectedReportCourse(itemValue)}
              >
                <Picker.Item label="Choose a course" value="" />
                {courses.map((course) => (
                  <Picker.Item
                    key={course.id}
                    label={`${course.code} - ${course.name}`}
                    value={course.code}
                  />
                ))}
              </Picker>
            </View>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateReport}
              disabled={generatingReport}
            >
              {generatingReport ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.generateButtonText}>Generate CSV</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setReportModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  pickerButton: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 12,
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
  errorBorder: {
    borderColor: "#dc3545",
    borderWidth: 2,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 12,
    marginTop: 4,
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
  qrLabel: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
    color: "#333",
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    width: '100%',
  },
  shareButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flex: 0.45,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  downloadButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flex: 0.45,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoImageContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoTextContainer: {
    marginTop: 12,
    width: '100%',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  infoCondition: {
    fontSize: 12,
    color: '#dc3545',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 6,
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
    marginTop: 12,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
});