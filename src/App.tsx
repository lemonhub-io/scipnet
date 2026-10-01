import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { trackPageview } from './analytics';
import { Footer } from './components/Footer';
import { Nav } from './components/Nav';
import { Pwa } from './components/Pwa';
import Category from './pages/Category';
import Docs from './pages/Docs';
import Home from './pages/Home';
import NewThread from './pages/NewThread';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Register from './pages/Register';
import SignIn from './pages/SignIn';
import Thread from './pages/Thread';

export default function App() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    trackPageview(pathname + search);
    if (hash) {
      document.querySelector(hash)?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, search, hash]);

  return (
    <div className="page">
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/c/:slug" element={<Category />} />
          <Route path="/t/:id" element={<Thread />} />
          <Route path="/new" element={<NewThread />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <Pwa />
    </div>
  );
}
