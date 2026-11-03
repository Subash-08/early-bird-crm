import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';

const jakarta=Plus_Jakarta_Sans({subsets:['latin'],variable:'--font-ui'});
export const metadata:Metadata={
  title:'EarlyBird Travel CRM',
  description:'Simple enquiry and follow-up workspace for travel teams',
  robots:{index:false,follow:false,nocache:true},
};
export const viewport={themeColor:'#12637d',width:'device-width',initialScale:1,viewportFit:'cover'};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body className={jakarta.variable}>{children}<PwaRegister/></body></html>;
}
