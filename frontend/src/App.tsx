import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login, ChangePassword } from './pages/Auth';
import { Messages } from './pages/Messages';
import { Notifications } from './pages/Notifications';
import * as T from './pages/teacher';
import * as S from './pages/student';

function Guard({ role, children }: { role: 'teacher' | 'student'; children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  return children;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/teacher" element={<Guard role="teacher"><Layout /></Guard>}>
        <Route index element={<T.Dashboard />} />
        <Route path="subjects" element={<T.Subjects />} />
        <Route path="groups" element={<T.Groups />} />
        <Route path="groups/:id" element={<T.GroupDetail />} />
        <Route path="students" element={<T.Students />} />
        <Route path="schedule" element={<T.Schedule />} />
        <Route path="attendance" element={<T.Attendance />} />
        <Route path="grades" element={<T.Grades />} />
        <Route path="materials" element={<T.Materials />} />
        <Route path="assignments" element={<T.Assignments />} />
        <Route path="assignments/:id" element={<T.AssignmentDetail />} />
        <Route path="tests" element={<T.Tests />} />
        <Route path="tests/new" element={<T.QuizEditor />} />
        <Route path="tests/:id/edit" element={<T.QuizEditor />} />
        <Route path="tests/:id" element={<T.QuizDetail />} />
        <Route path="live" element={<T.LiveList />} />
        <Route path="live/:id" element={<T.LiveClassroom />} />
        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="reports" element={<T.Reports />} />
        <Route path="settings" element={<T.Settings />} />
      </Route>
      <Route path="/student" element={<Guard role="student"><Layout /></Guard>}>
        <Route index element={<S.Dashboard />} />
        <Route path="profile" element={<S.Profile />} />
        <Route path="subjects" element={<S.Subjects />} />
        <Route path="subjects/:id" element={<S.SubjectDetail />} />
        <Route path="schedule" element={<S.Schedule />} />
        <Route path="attendance" element={<S.Attendance />} />
        <Route path="grades" element={<S.Grades />} />
        <Route path="materials" element={<S.Materials />} />
        <Route path="assignments" element={<S.Assignments />} />
        <Route path="assignments/:id" element={<S.AssignmentDetail />} />
        <Route path="tests" element={<S.Tests />} />
        <Route path="tests/:id" element={<S.TestTake />} />
        <Route path="live" element={<S.Live />} />
        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="stats" element={<S.Stats />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
