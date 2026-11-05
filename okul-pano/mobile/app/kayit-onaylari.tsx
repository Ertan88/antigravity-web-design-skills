import { useSignups } from '../src/data.ts';
import { SignupList } from '../src/platform.tsx';
import { Screen } from '../src/ui.tsx';

/** Platform yöneticisi: kayıt onayları (menüden) */
export default function KayitOnaylari() {
  const signups = useSignups();
  return (
    <Screen title="Kayıt onayları" subtitle="E-postası doğrulanmamış okul başvuruları" back refreshing={signups.isRefetching} onRefresh={() => void signups.refetch()}>
      <SignupList />
    </Screen>
  );
}
