import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Products from '@/pages/products';
import ProductDetails from '@/pages/product-details';
import Cart from '@/pages/cart';
import Checkout from '@/pages/checkout';
import About from '@/pages/about';
import Policy from '@/pages/policy';
import Guarantee from '@/pages/guarantee';
import Privacy from '@/pages/privacy';
import Contact from '@/pages/contact';
import Account from '@/pages/account';
import Orders from '@/pages/account-orders';
import Addresses from '@/pages/account-addresses';
import Profile from '@/pages/account-profile';
import Login from '@/pages/auth-login';
import VerifyOtp from '@/pages/auth-verify';
import { SiteIntro } from '@/components/site-intro';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { useLanguage } from './hooks/use-language';

const queryClient = new QueryClient();

import AdminRoutes from '@/pages/admin';
import OwnerLogin from '@/pages/owner-login';

function Router() {
  const [location] = useLocation();

  if (location.startsWith('/admin')) {
    return <AdminRoutes />;
  }

  if (location === '/owner/login') {
    return <OwnerLogin />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/products" component={Products} />
        <Route path="/products/:slug" component={ProductDetails} />
        <Route path="/categories/:slug" component={Products} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/about" component={About} />
        <Route path="/policy" component={Policy} />
        <Route path="/guarantee" component={Guarantee} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/contact" component={Contact} />
        
        <Route path="/auth/register" component={Login} />
        <Route path="/auth/verify-otp" component={VerifyOtp} />
        
        <Route path="/account" component={Account} />
        <Route path="/account/orders" component={Orders} />
        <Route path="/account/addresses" component={Addresses} />
        <Route path="/account/profile" component={Profile} />
        
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function InitLanguage() {
  const { lang } = useLanguage();
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}

function App() {
  const showSiteIntro = !window.location.pathname.startsWith('/admin') && window.location.pathname !== '/owner/login';

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {showSiteIntro && <SiteIntro />}
        <InitLanguage />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <Router />
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;