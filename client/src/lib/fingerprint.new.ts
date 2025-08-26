// require('../modules/WebSdk');

import { Event, FingerprintReader, SampleFormat } from '@digitalpersona/devices';
import type { Handler } from '@digitalpersona/devices/dist/typings/private';

interface IFingerprintControl {
  reader: FingerprintReader | null;
  isConnected: boolean;
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

  async init(retryCount = 3) {
    console.log('Initializing fingerprint reader...');
    
    try {
      if (this.reader) {
        console.log('Cleaning up existing reader...');
        await this.destroy();
      }

      // Create a new reader instance
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
        throw new Error('Device not ready after timeout');
      }

      // First, try to enumerate devices
      try {
        console.log('Enumerating devices...');
        const devices = await this.reader.enumerateDevices();
        if (devices && devices.length > 0) {
          console.log('Found devices:', devices);
          this.isConnected = true;
          this.onDeviceConnected({ deviceId: devices[0], deviceName: 'DigitalPersona Scanner' });
        } else {
          console.log('No devices found');
          this.isConnected = false;
          throw new Error('No fingerprint devices found');
        }
      } catch (enumErr) {
        console.warn('Device enumeration failed:', enumErr);
        throw enumErr;
      }

      // Then try to start acquisition
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

      // If we got here, initialization was successful
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

  onQualityReported: Handler<Event> = (event) => {
    console.log('Quality reported: ', event);
  };

  onSamplesAcquired: Handler<unknown> = (event) => {
    if (this.isConnected) {
      console.log('Sample acquired => ', event?.samples);
      const rawImages = (event as { samples: string[] }).samples.map((sample: string) => {
        try {
          return window.Base64.fromBase64Url(sample);
        } catch (err) {
          console.error('Error processing sample:', err);
          return null;
        }
      }).filter(Boolean);

      if (rawImages.length > 0) {
        console.log('Successfully processed fingerprint sample');
      } else {
        console.warn('No valid samples in acquisition');
      }
    } else {
      console.warn('Samples received but device is not marked as connected');
    }
  };

  onReaderError: Handler<Event> = (event) => {
    console.error('Reader error: ', event);
    if (event.toString().includes('0x80070057')) {
      this.isConnected = false;
    }
  };

  handleError = (error: unknown) => {
    console.error('Could not initialize reader: ', error);
    this.isConnected = false;
  };

  destroy = () => {
    if (this.reader) {
      this.reader.off();
      this.reader = null;
    }
    this.isConnected = false;
  };
}

export const fingerprintControl = new FingerprintControl();

export default FingerprintControl;
