import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, type ComponentType } from "react";
import { getToken, refreshAccessToken, getRefreshToken, removeToken } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/dashboard/Dashboard";
import Leads from "@/pages/dashboard/Leads";


import Settings from "@/pages/dashboard/Settings";
import DomainFinder from "@/pages/dashboard/DomainFinder";
import Billing from "@/pages/dashboard/Billing";
import Campaigns from "@/pages/dashboard/Campaigns";
import InboxPage from "@/pages/dashboard/Inbox";
import LinkedInOutreach from "@/pages/dashboard/LinkedIn";
import ReplyioPage from "@/pages/dashboard/ReplyioPage";
import CRM from "@/pages/dashboard/CRM";
import RecommendedTools from "@/pages/dashboard/RecommendedTools";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  if (!getToken()) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/dashboard/leads">
        <ProtectedRoute component={Leads} />
      </Route>
      <Route path="/dashboard/replyio">
        <ProtectedRoute component={ReplyioPage} />
      </Route>

      <Route path="/dashboard/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route path="/dashboard/domains">
        <ProtectedRoute component={DomainFinder} />
      </Route>
      <Route path="/dashboard/billing">
        <ProtectedRoute component={Billing} />
      </Route>
      <Route path="/dashboard/campaigns">
        <ProtectedRoute component={Campaigns} />
      </Route>
      <Route path="/dashboard/inbox">
        <ProtectedRoute component={InboxPage} />
      </Route>
      <Route path="/dashboard/linkedin">
        <ProtectedRoute component={LinkedInOutreach} />
      </Route>
      <Route path="/dashboard/crm">
        <ProtectedRoute component={CRM} />
      </Route>
      <Route path="/dashboard/tools">
        <ProtectedRoute component={RecommendedTools} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthRefresher() {
  useEffect(() => {
    const init = async () => {
      const token = getToken();
      const refreshToken = getRefreshToken();
      if (!token && !refreshToken) return;
      if (refreshToken) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          queryClient.invalidateQueries();
        } else {
          removeToken();
          window.location.href = '/login';
        }
      } else if (token) {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          removeToken();
          window.location.href = '/login';
        }
      }
    };
    init();
    const REFRESH_INTERVAL = 45 * 60 * 1000;
    const interval = setInterval(async () => {
      if (getRefreshToken()) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
          removeToken();
          window.location.href = '/login';
        }
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthRefresher />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;