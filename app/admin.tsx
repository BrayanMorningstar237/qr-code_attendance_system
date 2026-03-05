import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import firebase from "firebase/compat/app";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../firebase";

type Tab = "courses" | "teachers" | "students";

export default function AdminScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("courses");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Data states
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    teacherId: "",      // now store teacher ID
    email: "",
    department: "",
    matricule: "",
  });

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});

  // Fetch data based on active tab
  useEffect(() => {
    let unsubscribe: () => void;

    const fetchData = async () => {
      setLoading(true);
      console.log(`Fetching data for tab: ${activeTab}`);
      try {
        if (activeTab === "courses") {
          unsubscribe = db.collection("courses").onSnapshot(
            (snapshot) => {
              const coursesData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));
              console.log(`Fetched ${coursesData.length} courses`);
              setCourses(coursesData);
              setLoading(false);
            },
            (error) => {
              console.error("Error fetching courses:", error);
              Alert.alert("Error", "Failed to load courses");
              setLoading(false);
            }
          );
        } else if (activeTab === "teachers") {
          unsubscribe = db
            .collection("users")
            .where("role", "==", "teacher")
            .onSnapshot(
              (snapshot) => {
                const teachersData = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));
                console.log(`Fetched ${teachersData.length} teachers`);
                setTeachers(teachersData);
                setLoading(false);
              },
              (error) => {
                console.error("Error fetching teachers:", error);
                Alert.alert("Error", "Failed to load teachers");
                setLoading(false);
              }
            );
        } else if (activeTab === "students") {
          unsubscribe = db
            .collection("users")
            .where("role", "==", "student")
            .onSnapshot(
              (snapshot) => {
                const studentsData = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));
                console.log(`Fetched ${studentsData.length} students`);
                setStudents(studentsData);
                setLoading(false);
              },
              (error) => {
                console.error("Error fetching students:", error);
                Alert.alert("Error", "Failed to load students");
                setLoading(false);
              }
            );
        }
      } catch (error) {
        console.error("Error setting up listener:", error);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (unsubscribe) {
        console.log(`Unsubscribing from ${activeTab} listener`);
        unsubscribe();
      }
    };
  }, [activeTab]);

  const handleAdd = () => {
    console.log("Opening add modal");
    setEditingItem(null);
    setFormData({
      code: "",
      name: "",
      teacherId: "",
      email: "",
      department: "",
      matricule: "",
    });
    setErrors({});
    setModalVisible(true);
  };

  const handleEdit = (item: any) => {
    console.log("Editing item:", item.id, item);
    setEditingItem(item);
    if (activeTab === "courses") {
      setFormData({
        code: item.code || "",
        name: item.name || "",
        teacherId: item.teacherId || "",
        email: "",
        department: "",
        matricule: "",
      });
    } else if (activeTab === "teachers") {
      setFormData({
        code: "",
        name: item.name || "",
        teacherId: "",
        email: item.email || "",
        department: item.department || "",
        matricule: "",
      });
    } else {
      setFormData({
        code: "",
        name: item.name || "",
        teacherId: "",
        email: item.email || "",
        department: "",
        matricule: item.matricule || "",
      });
    }
    setErrors({});
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (activeTab !== "courses") {
      Alert.alert("Info", "Deleting users is not supported in this demo.");
      return;
    }

    Alert.alert("Delete", "Are you sure you want to delete this course?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            console.log("Deleting course:", id);
            await db.collection("courses").doc(id).delete();
            console.log("Course deleted successfully:", id);
          } catch (error) {
            console.error("Error deleting course:", error);
            Alert.alert("Error", "Failed to delete course");
          }
        },
      },
    ]);
  };

  const validateForm = () => {
    const newErrors: any = {};
    if (activeTab === "courses") {
      if (!formData.code) newErrors.code = true;
      if (!formData.name) newErrors.name = true;
      if (!formData.teacherId) newErrors.teacherId = true;
    } else if (activeTab === "teachers") {
      if (!formData.name) newErrors.name = true;
    } else if (activeTab === "students") {
      if (!formData.name) newErrors.name = true;
      if (!formData.matricule) newErrors.matricule = true;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    console.log("Saving form for tab:", activeTab, "editing:", !!editingItem);

    if (!validateForm()) {
      console.log("Validation failed, errors:", errors);
      Alert.alert("Error", "Please fill all required fields");
      return;
    }

    try {
      if (activeTab === "courses") {
        // Get the selected teacher's name for display (optional)
        const selectedTeacher = teachers.find(t => t.id === formData.teacherId);
        const courseData = {
          code: formData.code,
          name: formData.name,
          teacherId: formData.teacherId,
          teacherName: selectedTeacher?.name || "", // store teacher name for easy display
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (editingItem) {
          console.log("Updating course:", editingItem.id);
          await db.collection("courses").doc(editingItem.id).update(courseData);
          console.log("Course updated successfully");
        } else {
          console.log("Adding new course");
          await db.collection("courses").add({
            ...courseData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          console.log("Course added successfully");
        }
      } else if (activeTab === "teachers") {
        if (!formData.name) {
          Alert.alert("Error", "Name is required");
          return;
        }
        const teacherData: any = {
          name: formData.name,
          department: formData.department || "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (editingItem) {
          const oldName = editingItem.name;
          console.log(`Updating teacher: ${oldName} → ${formData.name}`);

          await db.collection("users").doc(editingItem.id).update(teacherData);
          console.log("Teacher updated successfully");

          // If name changed, update all courses that have this teacherId with the new teacherName
          if (oldName !== formData.name) {
            console.log(`Teacher name changed, updating courses taught by ${editingItem.id}`);
            const coursesSnapshot = await db.collection("courses").where("teacherId", "==", editingItem.id).get();
            if (!coursesSnapshot.empty) {
              const batch = db.batch();
              coursesSnapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { teacherName: formData.name });
              });
              await batch.commit();
              console.log(`Updated ${coursesSnapshot.size} courses with new teacher name`);
            }
          }
        } else {
          Alert.alert("Info", "Please use the signup screen to create new teachers.");
          setModalVisible(false);
          return;
        }
      } else if (activeTab === "students") {
        if (!formData.name || !formData.matricule) {
          Alert.alert("Error", "Name and matricule are required");
          return;
        }
        const studentData: any = {
          name: formData.name,
          matricule: formData.matricule,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (editingItem) {
          console.log("Updating student:", editingItem.id);
          await db.collection("users").doc(editingItem.id).update(studentData);
          console.log("Student updated successfully");
        } else {
          Alert.alert("Info", "Please use the signup screen to create new students.");
          setModalVisible(false);
          return;
        }
      }
      setModalVisible(false);
    } catch (error) {
      console.error("Error saving:", error);
      Alert.alert("Error", "Failed to save data");
    }
  };

  const renderCourseItem = ({ item }: any) => {
    // Display teacher name from stored teacherName or look up in teachers list
    const teacherDisplay = item.teacherName || (teachers.find(t => t.id === item.teacherId)?.name) || "Unknown";
    return (
      <View style={styles.listItem}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{item.code} - {item.name}</Text>
          <Text style={styles.itemSubtitle}>Teacher: {teacherDisplay}</Text>
        </View>
        <View style={styles.itemActions}>
          <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionButton}>
            <Ionicons name="create-outline" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={20} color="#dc3545" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTeacherItem = ({ item }: any) => (
    <View style={styles.listItem}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemSubtitle}>{item.email} • {item.department || "No dept"}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionButton}>
          <Ionicons name="create-outline" size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStudentItem = ({ item }: any) => (
    <View style={styles.listItem}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemSubtitle}>{item.matricule} • {item.email}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionButton}>
          <Ionicons name="create-outline" size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      );
    }

    if (activeTab === "courses") {
      return (
        <FlatList
          data={courses}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No courses found</Text>}
        />
      );
    } else if (activeTab === "teachers") {
      return (
        <FlatList
          data={teachers}
          renderItem={renderTeacherItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No teachers found</Text>}
        />
      );
    } else {
      return (
        <FlatList
          data={students}
          renderItem={renderStudentItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No students found</Text>}
        />
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <TouchableOpacity onPress={handleAdd}>
          <Ionicons name="add" size={28} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "courses" && styles.activeTab]}
          onPress={() => setActiveTab("courses")}
        >
          <Text style={[styles.tabText, activeTab === "courses" && styles.activeTabText]}>Courses</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "teachers" && styles.activeTab]}
          onPress={() => setActiveTab("teachers")}
        >
          <Text style={[styles.tabText, activeTab === "teachers" && styles.activeTabText]}>Teachers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "students" && styles.activeTab]}
          onPress={() => setActiveTab("students")}
        >
          <Text style={[styles.tabText, activeTab === "students" && styles.activeTabText]}>Students</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {renderList()}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingItem ? "Edit" : "Add"} {activeTab.slice(0, -1)}
            </Text>

            {activeTab === "courses" && (
              <>
                <TextInput
                  style={[styles.modalInput, errors.code && styles.errorInput]}
                  placeholder="Course Code"
                  value={formData.code}
                  onChangeText={(t) => setFormData({ ...formData, code: t })}
                />
                <TextInput
                  style={[styles.modalInput, errors.name && styles.errorInput]}
                  placeholder="Course Name"
                  value={formData.name}
                  onChangeText={(t) => setFormData({ ...formData, name: t })}
                />
                <View style={[styles.pickerContainer, errors.teacherId && styles.errorPicker]}>
                  {teachers.length > 0 ? (
                    <Picker
                      selectedValue={formData.teacherId}
                      onValueChange={(itemValue) => setFormData({ ...formData, teacherId: itemValue })}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select a teacher" value="" />
                      {teachers.map((teacher) => (
                        <Picker.Item key={teacher.id} label={teacher.name} value={teacher.id} />
                      ))}
                    </Picker>
                  ) : (
                    <View style={styles.pickerPlaceholder}>
                      <Text style={styles.pickerPlaceholderText}>No teachers available</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {activeTab === "teachers" && (
              <>
                <TextInput
                  style={[styles.modalInput, errors.name && styles.errorInput]}
                  placeholder="Full Name"
                  value={formData.name}
                  onChangeText={(t) => setFormData({ ...formData, name: t })}
                />
                <TextInput
                  style={[styles.modalInput, styles.readOnlyInput]}
                  placeholder="Email (read-only)"
                  value={formData.email}
                  editable={false}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Department"
                  value={formData.department}
                  onChangeText={(t) => setFormData({ ...formData, department: t })}
                />
              </>
            )}

            {activeTab === "students" && (
              <>
                <TextInput
                  style={[styles.modalInput, errors.name && styles.errorInput]}
                  placeholder="Full Name"
                  value={formData.name}
                  onChangeText={(t) => setFormData({ ...formData, name: t })}
                />
                <TextInput
                  style={[styles.modalInput, errors.matricule && styles.errorInput]}
                  placeholder="Matricule (FE23Axxx)"
                  value={formData.matricule}
                  onChangeText={(t) => setFormData({ ...formData, matricule: t })}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={[styles.modalInput, styles.readOnlyInput]}
                  placeholder="Email (read-only)"
                  value={formData.email}
                  editable={false}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
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
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#e6f2ff",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
  },
  listItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  itemSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  itemActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
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
  modalInput: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 16,
  },
  readOnlyInput: {
    backgroundColor: "#eee",
    color: "#666",
  },
  errorInput: {
    borderColor: "#dc3545",
    borderWidth: 2,
  },
  pickerContainer: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
    marginBottom: 16,
    minHeight: 50,
    justifyContent: "center",
  },
  errorPicker: {
    borderColor: "#dc3545",
    borderWidth: 2,
  },
  picker: {
    height: 50,
    width: "100%",
  },
  pickerPlaceholder: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerPlaceholderText: {
    color: "#999",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
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
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#007AFF",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});