import { Redirect } from 'expo-router';

/** Oturum kapalıyken ana adres (payflow:///) giriş ekranına gider. */
export default function AuthIndex() {
  return <Redirect href="/login" />;
}
