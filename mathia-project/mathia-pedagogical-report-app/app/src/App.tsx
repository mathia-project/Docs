import { Route, Router } from "@solidjs/router";
import type { Component, ParentComponent } from "solid-js";

import { AuthGate } from "./components/auth/AuthGate";
import { AppLayout } from "./layouts/AppLayout";
import { DirectorDashboardPage } from "./pages/DirectorDashboardPage";
import { AssignmentsPage } from "./pages/director/AssignmentsPage";
import { ClassDetailPage } from "./pages/director/ClassDetailPage";
import { ClassesPage } from "./pages/director/ClassesPage";
import { SchoolsPage } from "./pages/director/SchoolsPage";
import { StudentsPage } from "./pages/director/StudentsPage";
import { TeachersPage } from "./pages/director/TeachersPage";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { QuestionBankPage } from "./pages/QuestionBankPage";
import { ResourceBankPage } from "./pages/ResourceBankPage";
import { RoleHomePage } from "./pages/RoleHomePage";
import { StudentBackpackPage } from "./pages/StudentBackpackPage";
import { StudentDashboardPage } from "./pages/StudentDashboardPage";
import { StudentTestPlayerPage } from "./pages/StudentTestPlayerPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { TeacherClassesPage } from "./pages/teacher/TeacherClassesPage";
import { TeacherClassDetailPage } from "./pages/teacher/TeacherClassDetailPage";
import { TestsPage } from "./pages/TestsPage";
import { PedagogicalReportPage } from "./pages/reports/PedagogicalReportPage";
import { ReportExamplesPage } from "./pages/reports/ReportExamplesPage";

const DirectorRouteLayout: ParentComponent = (props) => (
  <AuthGate allowedRoles={["director"]}>
    <AppLayout>{props.children}</AppLayout>
  </AuthGate>
);

const App: Component = () => (
  <Router>
    {import.meta.env.DEV && <Route path="/dev/report-examples" component={ReportExamplesPage} />}
    <Route path="/" component={RoleHomePage} />
    <Route path="/login" component={LoginPage} />
    <Route path="/forbidden" component={ForbiddenPage} />
    <Route
      path="/student"
      component={() => (
        <AuthGate allowedRoles={["student"]}>
          <AppLayout>
            <StudentDashboardPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/student/backpack"
      component={() => (
        <AuthGate allowedRoles={["student"]}>
          <AppLayout>
            <StudentBackpackPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/student/tests/:assignmentId"
      component={() => (
        <AuthGate allowedRoles={["student"]}>
          <StudentTestPlayerPage />
        </AuthGate>
      )}
    />
    <Route
      path="/teacher"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <TeacherDashboardPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/classes"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <TeacherClassesPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/classes/:id"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <TeacherClassDetailPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/tests"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <TestsPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/questions"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <QuestionBankPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/resources"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <ResourceBankPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/classes/:classId/students/:studentId/report"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <PedagogicalReportPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route
      path="/teacher/students/:studentId/report"
      component={() => (
        <AuthGate allowedRoles={["teacher", "director"]}>
          <AppLayout>
            <PedagogicalReportPage />
          </AppLayout>
        </AuthGate>
      )}
    />
    <Route path="/director" component={DirectorRouteLayout}>
      <Route path="/" component={DirectorDashboardPage} />
      <Route path="/schools" component={SchoolsPage} />
      <Route path="/classes" component={ClassesPage} />
      <Route path="/classes/:id" component={ClassDetailPage} />
      <Route path="/students" component={StudentsPage} />
      <Route path="/students/:studentId/report" component={PedagogicalReportPage} />
      <Route path="/classes/:classId/students/:studentId/report" component={PedagogicalReportPage} />
      <Route path="/teachers" component={TeachersPage} />
      <Route path="/assignments" component={AssignmentsPage} />
      <Route path="/tests" component={TestsPage} />
      <Route path="/questions" component={QuestionBankPage} />
      <Route path="/resources" component={ResourceBankPage} />
    </Route>
    <Route path="*" component={NotFoundPage} />
  </Router>
);

export default App;
