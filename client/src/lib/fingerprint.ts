import { Event, FingerprintReader, SampleFormat } from '@digitalpersona/devices';
import type { Handler } from '@digitalpersona/devices/dist/typings/private';
import { toast } from 'react-hot-toast';
import { Base64 } from '@digitalpersona/core';

interface IFingerprintControl {
  reader: FingerprintReader | null;
  onDeviceConnected: Handler<Event>;
  onDeviceDisconnected: Handler<Event>;
  onQualityReported: Handler<Event>;
  onSamplesAcquired: Handler<Event>;
  onReaderError: Handler<Event>;
  handleError: (err: unknown) => void;
}

class FingerprintControl implements IFingerprintControl {
  reader: FingerprintReader | null = null;
  isConnected: boolean = false;

  private async ensureWebSdkLoaded(): Promise<void> {
    if ((window as any).dpQuery) return;
    
    console.log('Loading WebSDK...');
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/modules/websdkv1.js';
      script.onload = () => {
        console.log('WebSDK loaded successfully');
        resolve();
      };
      script.onerror = () => {
        const error = new Error('Failed to load WebSDK');
        console.error(error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  private async waitForDeviceReady(timeoutMs = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkDevice = async () => {
        try {
          if (!this.reader) {
            resolve(false);
            return;
          }

          const devices = await this.reader.enumerateDevices();
          if (devices && devices.length > 0) {
            console.log('Device is ready:', devices[0]);
            resolve(true);
            return;
          }

          if (Date.now() - startTime > timeoutMs) {
            console.log('Device ready timeout');
            resolve(false);
            return;
          }

          setTimeout(checkDevice, 500);
        } catch (err) {
          console.warn('Error checking device:', err);
          resolve(false);
        }
      };

      checkDevice();
    });
  }

  async init(retryCount = 3): Promise<void> {
    console.log('Initializing fingerprint reader...');
    
    try {
      // Ensure WebSDK is loaded
      await this.ensureWebSdkLoaded();

      if (this.reader) {
        console.log('Cleaning up existing reader...');
        await this.destroy();
      }

      this.reader = new FingerprintReader();
      
      // Set up event handlers before initialization
      this.reader.on('DeviceConnected', this.onDeviceConnected);
      this.reader.on('DeviceDisconnected', this.onDeviceDisconnected);
      this.reader.on('QualityReported', this.onQualityReported);
      this.reader.on('SamplesAcquired', this.onSamplesAcquired);
      this.reader.on('ErrorOccurred', this.onReaderError);

      // Wait for device to become ready
      const isReady = await this.waitForDeviceReady();
      
      if (!isReady) {
        toast.error('Please ensure the fingerprint scanner is properly connected');
        throw new Error('Device not ready after timeout');
      }

      // Try to enumerate devices
      try {
        console.log('Enumerating devices...');
        const devices = await this.reader.enumerateDevices();
        if (devices && devices.length > 0) {
          console.log('Found devices:', devices);
          this.isConnected = true;
          toast.success('Fingerprint scanner connected successfully');
          this.onDeviceConnected(new Event('DeviceConnected'));
        } else {
          console.log('No devices found');
          this.isConnected = false;
          toast.error('No fingerprint devices found');
          throw new Error('No fingerprint devices found');
        }
      } catch (enumErr) {
        console.warn('Device enumeration failed:', enumErr);
        throw enumErr;
      }

      // Try to start acquisition with retries
      try {
        console.log('Starting acquisition...');
        await this.reader.startAcquisition(SampleFormat.PngImage);
        console.log('Successfully started acquisition');
      } catch (err) {
        if (retryCount > 0) {
          console.log(`Acquisition start failed, retrying... (${retryCount} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          return this.init(retryCount - 1);
        }
        throw err;
      }

      console.log('Successfully initialized fingerprint reader');

    } catch (err) {
      this.handleError(err);
      this.isConnected = false;
      throw err;
    }
  }

  onDeviceConnected: Handler<Event> = (event) => {
    console.log('Device connected: ', event);
    this.isConnected = true;
  };

  onDeviceDisconnected: Handler<Event> = (event) => {
    console.log('Device disconnected: ', event);
    this.isConnected = false;
  };

  onQualityReported: Handler<Event> = (event) => console.log('Quality reported: ', event);

  onSamplesAcquired: Handler<unknown> = (event) =>
    console.log('Samples acquired: ', (event as { samples: string[] }).samples);

  onReaderError: Handler<Event> = (event) => {
    console.error('Reader error: ', event);
    // Only set disconnected if it's a connection-related error
    if (event.toString().includes('0x80070057')) {
      this.isConnected = false;
    }
  };

  handleError = (error: unknown) => {
    console.error('Could not initialize reader: ', error);
    // Set disconnected state on initialization errors
    this.isConnected = false;
  };

  destroy = () => {
    if (this.reader) {
      this.reader.off();
      this.reader = null;
    }
  };
}

export const fingerprintControl = new FingerprintControl();

export default FingerprintControl;
