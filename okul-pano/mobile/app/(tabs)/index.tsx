import { useAuth } from '../../src/auth.tsx';
import { EditorHome } from '../../src/editor.tsx';
import { ManagerHome } from '../../src/manager.tsx';
import { PlatformHome } from '../../src/platform.tsx';
import { TeacherHome } from '../../src/teacher.tsx';

/** Ana ekran role göre: platform, kontrol merkezi (sahip ve yönetici), içerik (editör), "Bugün" (öğretmen) */
export default function Home() {
  const { role } = useAuth();
  if (role === 'platform') return <PlatformHome />;
  if (role === 'owner' || role === 'admin') return <ManagerHome />;
  if (role === 'editor') return <EditorHome />;
  return <TeacherHome />;
}
