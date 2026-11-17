import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';

const dmSans=DM_Sans({subsets:['latin'],weight:'variable',variable:'--font-ui'});
export const metadata:Metadata={
  title:'EarlyBird Travel CRM',
  description:'Simple enquiry and follow-up workspace for travel teams',
  robots:{index:false,follow:false,nocache:true},
};
export const viewport={themeColor:'#12637d',width:'device-width',initialScale:1,viewportFit:'cover'};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body className={dmSans.variable}>{children}<PwaRegister/></body></html>;
}
