import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import VisitScreen from "./src/screens/VisitScreen";
import DocumentsScreen from "./src/screens/DocumentsScreen";
import MealsScreen from "./src/screens/MealsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import { clearToken, getToken, me, onUnauthorized, setToken } from "./src/api";
import { colors, spacing } from "./src/theme";

const TABS = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "visit", label: "Visit", icon: "💬" },
  { key: "documents", label: "Docs", icon: "📄" },
  { key: "meals", label: "Meals", icon: "🥗" },
  { key: "profile", label: "Profile", icon: "👤" },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState("home");
  const [visit, setVisit] = useState(null);

  function handleLogout() {
    clearToken();
    setAccount(null);
    setVisit(null);
    setTab("home");
  }

  useEffect(() => {
    onUnauthorized(() => {
      setAccount(null);
      setVisit(null);
      setTab("home");
    });
    (async () => {
      if (!getToken()) {
        setBooting(false);
        return;
      }
      try {
        const acc = await me();
        setAccount(acc);
        setToken(acc.token);
      } catch {
        clearToken();
        setAccount(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  function handleAuthed(acc) {
    if (acc?.token) setToken(acc.token);
    setAccount(acc);
    setTab("visit"); // AI receptionist first after login/register
  }

  function navigate(key) {
    setTab(key);
  }

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!account) {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  const sessionId = visit?.sessionId || null;

  function renderScreen() {
    switch (tab) {
      case "home":
        return <HomeScreen account={account} visit={visit} onNavigate={navigate} />;
      case "visit":
        return (
          <VisitScreen account={account} visit={visit} onVisitChange={setVisit} />
        );
      case "documents":
        return <DocumentsScreen sessionId={sessionId} />;
      case "meals":
        return (
          <MealsScreen
            account={account}
            onAccountUpdate={setAccount}
            sessionId={sessionId}
          />
        );
      case "profile":
        return (
          <ProfileScreen
            account={account}
            onAccountUpdate={setAccount}
            onLogout={handleLogout}
          />
        );
      default:
        return null;
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>{renderScreen()}</View>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTab(t.key)}
              accessibilityRole="button"
            >
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "500" },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },
});
