import { useAuth } from '../../src/auth.tsx';
import { ManagerHome } from '../../src/manager.tsx';
import { TeacherHome } from '../../src/teacher.tsx';

/** Ana ekran: yöneticiye kontrol merkezi, öğretmene "Bugün" */
export default function Home() {
  const { isManager } = useAuth();
  return isManager ? <ManagerHome /> : <TeacherHome />;
}
