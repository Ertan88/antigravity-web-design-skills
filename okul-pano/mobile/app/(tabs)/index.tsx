import { useAuth } from '../../src/auth.tsx';
import { useExitGuard } from '../../src/exitGuard.ts';
import { EditorHome } from '../../src/editor.tsx';
import { ManagerHome } from '../../src/manager.tsx';
import { PlatformHome } from '../../src/platform.tsx';
import { TeacherHome } from '../../src/teacher.tsx';

/** Ana ekran role göre: platform, kontrol merkezi (sahip ve yönetici), içerik (editör), "Bugün" (öğretmen) */
export default function Home() {
  const { role } = useAuth();
  // Ana ekrandan geri tuşuyla yanlışlıkla çıkılmasın: iki kez basınca çıkılır
  useExitGuard();
  if (role === 'platform') return <PlatformHome />;
  if (role === 'owner' || role === 'admin') return <ManagerHome />;
  if (role === 'editor') return <EditorHome />;
  return <TeacherHome />;
}
