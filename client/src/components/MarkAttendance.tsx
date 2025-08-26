import { useState, useEffect, useRef } from 'react';
import type { FC, FormEventHandler } from 'react';
import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  FormControl,
  FormLabel,
  Text,
  Button,
  Box,
  Image,
} from '@chakra-ui/react';
import Select from 'react-select';
import { InfoIcon } from '@chakra-ui/icons';
import { Flex } from '@chakra-ui/react';
import { useMarkAttendance } from '../api/atttendance.api';
import { useGetStudents } from '../api/student.api';
import type { MarkAttendanceInput, Attendance } from '../interfaces/api.interface';
import useStore from '../store/store';
import SimpleReactValidator from 'simple-react-validator';
import { toast } from 'react-hot-toast';
import Swal from 'sweetalert2';
import { removeObjectProps } from '../../../server/src/helpers/general.helper';
import { fingerprintControl } from '../lib/fingerprint';
import { Base64 } from '@digitalpersona/core';
import { getFingerprintImgString } from './AddStudent';
import axios from 'axios';
import constants from '../config/constants.config';

const MarkAttendance: FC<{
  isOpen: boolean;
  size: string;
  onClose: () => void;
  closeDrawer: () => void;
  activeAttendance: Attendance | null;
}> = ({ isOpen, onClose, size, closeDrawer, activeAttendance }) => {
  const staffInfo = useStore.use.staffInfo();
  const [page] = useState<number>(1);
  const [per_page] = useState<number>(999);
  const [markInput, setMarkInput] = useState<MarkAttendanceInput>({
    student_id: '',
    attendance_id: '',
  });
  // Keep a ref to the latest markInput so event handlers bound once can read up-to-date values
  const markInputRef = useRef<MarkAttendanceInput>(markInput);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [fingerprints, setFingerprints] = useState<{ studentFingerprint: string; newFingerprint: string }>({
    studentFingerprint: '',
    newFingerprint: '',
  });
  const [, forceUpdate] = useState<boolean>(false);
  const { data: studentData } = useGetStudents(
    staffInfo?.id as string,
    page,
    per_page,
  )({
    queryKey: ['availablestudents', page],
    keepPreviousData: true,
  });

  const defaultMarkInput = () => {
    setMarkInput({ student_id: '', attendance_id: '' });
    setFingerprints({ newFingerprint: '', studentFingerprint: '' });
    setIsVerified(false);
  };

  const verifyFingerprint = async (newFingerprint: string) => {
    try {
      if (!fingerprints.studentFingerprint) {
        Swal.fire({
          title: 'Error!',
          text: 'No stored fingerprint found for this student',
          icon: 'error',
          confirmButtonColor: 'var(--bg-primary)'
        });
        return;
      }

      // Clean and validate base64 strings
      const cleanBase64 = (base64String: string) => {
        try {
          if (!base64String.includes('data:image')) {
            return base64String.trim();
          }
          const cleaned = base64String.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
          return cleaned.trim();
        } catch (error) {
          console.error('Error cleaning base64:', error);
          throw new Error('Invalid fingerprint data format');
        }
      };

      const cleanedStudentFingerprint = cleanBase64(fingerprints.studentFingerprint);
      const cleanedNewFingerprint = cleanBase64(newFingerprint);

      if (!cleanedStudentFingerprint || !cleanedNewFingerprint) {
        throw new Error('Invalid fingerprint data after cleaning');
      }

      // Show verification in progress
      Swal.fire({
        title: 'Verifying...',
        text: 'Checking fingerprint match',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

  // Send sample to Python backend for verification; server will use stored template if available
  const payload: any = { sample: cleanedNewFingerprint };
  // If client has an updated stored template (unlikely in normal flow), include it
  if (cleanedStudentFingerprint) payload.stored = cleanedStudentFingerprint;

  const verificationResponse = await axios.post(`${constants.matchBaseUrl}/verify/fingerprint`, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000
      });

      const { match_result, match_score } = verificationResponse.data;

      if (match_result) {
        setIsVerified(true);
        await Swal.fire({
          title: 'Verification Successful!',
          text: `Fingerprint matched with ${match_score.toFixed(1)}% confidence. You can now mark attendance.`,
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: 'var(--bg-primary)'
        });
      } else {
        setIsVerified(false);
        await Swal.fire({
          title: 'Verification Failed',
          text: `Fingerprint did not match (${match_score.toFixed(1)}% confidence). Please try again.`,
          icon: 'error',
          confirmButtonText: 'OK',
          confirmButtonColor: 'var(--bg-primary)'
        });
      }
    } catch (err: any) {
      console.error('Error during fingerprint verification:', err);
      setIsVerified(false);
      Swal.fire({
        title: 'Error!',
        text: err.response?.data?.message || 'Failed to verify fingerprint. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK',
        confirmButtonColor: 'var(--bg-primary)'
      });
    }
  };

  const { isLoading, mutate: markAttendance } = useMarkAttendance({
    onSuccess: () => {
      closeDrawer();
      toast.success('Student marked successfully');
      defaultMarkInput();
    },
    onError: (err) => {
      toast.error((err.response?.data?.message as string) ?? 'An error occurred');
    },
  });

  const handleDeviceConnected = () => {
    console.log('Device connected');
    setDeviceConnected(true);
  };

  const handleDeviceDisconnected = () => {
    console.log('Device disconnected.');
    setDeviceConnected(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSampleAcquired = (event: any) => {
    console.log('Sample acquired => ', event?.samples);
    if (!event?.samples?.length) {
      console.error('No samples received from fingerprint reader');
      toast.error('No fingerprint sample received. Please try again.');
      return;
    }
    try {
      // Convert from base64url to standard base64
      const rawImages = event.samples.map((sample: string) => Base64.fromBase64Url(sample));
      const newFingerprint = rawImages[0];
      
      // Store the base64 data
      setFingerprints((prev) => ({ ...prev, newFingerprint }));

  // Auto-mark attendance once a fingerprint is scanned and the picture shows
  const currentMarkInput = markInputRef.current;
  if (!currentMarkInput.student_id) {
        toast.error('Please select a student before scanning the fingerprint.');
        return;
      }

      // Show marking in progress
      Swal.fire({
        title: 'Marking Attendance...',
        text: 'Processing your fingerprint sample',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      (async () => {
        try {
          await markAttendance(currentMarkInput);
          Swal.close();
          await Swal.fire({
            title: 'Success!',
            text: 'Attendance marked successfully',
            icon: 'success',
            confirmButtonText: 'OK',
            confirmButtonColor: 'var(--bg-primary)'
          });
          closeDrawer();
          defaultMarkInput();
        } catch (err: any) {
          console.error('Auto-mark failed:', err);
          Swal.close();
          Swal.fire({
            title: 'Error!',
            text: err.response?.data?.message || 'Failed to mark attendance. Please try again.',
            icon: 'error',
            confirmButtonText: 'OK',
            confirmButtonColor: 'var(--bg-primary)'
          });
        }
      })();
    } catch (error) {
      console.error('Error processing fingerprint sample:', error);
      toast.error('Failed to process fingerprint sample. Please try again.');
    }
  };

  useEffect(() => {
    if (isOpen && activeAttendance) {
      setMarkInput((prev) => ({
        ...prev,
        attendance_id: activeAttendance.id,
      }));
    }
  }, [isOpen, activeAttendance]);

  // keep ref in sync with state
  useEffect(() => {
    markInputRef.current = markInput;
  }, [markInput]);

  useEffect(() => {
    const initializeReader = async () => {
      try {
        fingerprintControl.onDeviceConnected = handleDeviceConnected;
        fingerprintControl.onDeviceDisconnected = handleDeviceDisconnected;
        fingerprintControl.onSamplesAcquired = handleSampleAcquired;
        
        await fingerprintControl.init();
        
        // Check initial connection state
        setDeviceConnected(fingerprintControl.isConnected);
        
        if (fingerprintControl.isConnected) {
          toast.success('Fingerprint scanner connected');
        } else {
          console.warn('Fingerprint scanner not connected during initialization');
          toast.error('Fingerprint scanner not detected. You can still mark attendance without scanning.');
        }
      } catch (err: any) {
        console.error('Failed to initialize fingerprint reader:', err.message, err.stack);
        toast.error('Failed to initialize fingerprint reader. Check connection or proceed without scanning.');
        setDeviceConnected(false);
      }
    };

    if (isOpen) {
      initializeReader();
    }

    return () => {
      // Cleanup when drawer closes
      try {
        fingerprintControl.destroy();
      } catch (err) {
        console.error('Error during fingerprintControl cleanup:', err);
      }
      setDeviceConnected(false);
    };
  }, [isOpen]);

  const simpleValidator = useRef(
    new SimpleReactValidator({
      element: (message: string) => <div className="formErrorMsg">{message}</div>,
    }),
  );

  const handleAddAttendance: FormEventHandler = async (e) => {
    e.preventDefault();
    if (simpleValidator.current.allValid()) {
      try {
        if (!isVerified) {
          await Swal.fire({
            title: 'Verification Required',
            text: 'Please scan and verify fingerprint before marking attendance',
            icon: 'warning',
            confirmButtonText: 'OK',
            confirmButtonColor: 'var(--bg-primary)'
          });
          return;
        }

        // Show marking in progress
        Swal.fire({
          title: 'Marking Attendance...',
          text: 'Processing your request',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // Mark attendance
        await markAttendance(markInput);
        
        // Success alert
        await Swal.fire({
          title: 'Success!',
          text: 'Attendance marked successfully',
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: 'var(--bg-primary)'
        });

        closeDrawer();
      } catch (err: any) {
        console.error('Error marking attendance:', err);
        Swal.fire({
          title: 'Error!',
          text: err.response?.data?.message || 'Failed to mark attendance. Please try again.',
          icon: 'error',
          confirmButtonText: 'OK',
          confirmButtonColor: 'var(--bg-primary)'
        });
      }
    } else {
      simpleValidator.current.showMessages();
      forceUpdate((prev) => !prev);
    }
  };

  const students =
    studentData?.data?.students?.map((student) => ({
      value: student.id,
      label: `${student.name} (${student.matric_no})`,
    })) ?? [];

  return (
    <Drawer
      onClose={() => {
        defaultMarkInput();
        onClose();
      }}
      isOpen={isOpen}
      size={size}
    >
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>
          <Flex justifyContent="space-between" alignItems="center">
            <Text>Mark Student</Text>
            {activeAttendance && (
              <Button
                colorScheme="red"
                size="sm"
                onClick={async () => {
                  const confirm = await Swal.fire({
                    title: 'End Attendance',
                    text: 'This will email absent students. Are you sure you want to end this attendance session?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, end it',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: 'var(--bg-primary)'
                  });

                  if (confirm.isConfirmed) {
                    try {
                      Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                      const resp = await axios.post(`${constants.baseUrl}/attendance/${activeAttendance.id}/end`);
                      Swal.close();
                      Swal.fire({ title: 'Done', text: `Notified ${resp.data.data.absentCount} absent students`, icon: 'success', confirmButtonColor: 'var(--bg-primary)' });
                      closeDrawer();
                    } catch (err: any) {
                      console.error('Failed to end attendance', err);
                      Swal.fire({ title: 'Error', text: err.response?.data?.message || 'Failed to end attendance', icon: 'error', confirmButtonColor: 'var(--bg-primary)' });
                    }
                  }
                }}
              >
                End Attendance
              </Button>
            )}
          </Flex>
        </DrawerHeader>
        <DrawerBody>
          <form className="login-form" method="post" action="#" onSubmit={handleAddAttendance}>
            <FormControl>
              <FormLabel>Student</FormLabel>
              <Select
                value={students?.find((student) => student.value === markInput.student_id)}
                options={students}
                onChange={(newValue) => {
                  setMarkInput((prev) => ({ ...prev, student_id: newValue?.value ?? '' }));
                  const selectedStudent = studentData?.data?.students?.find((student) => student.id === newValue?.value);
                  const storedFingerprint = selectedStudent?.fingerprint ?? '';
                  console.log('Retrieved stored fingerprint:', storedFingerprint ? 'Present' : 'Not found');
                  setFingerprints((prev) => ({
                    ...prev,
                    studentFingerprint: storedFingerprint,
                  }));
                  if (!storedFingerprint) {
                    toast.error('No stored fingerprint for this student');
                  }
                }}
              />
              {simpleValidator.current.message('student', markInput.student_id, 'required|between:2,128')}
            </FormControl>
            <FormControl marginTop="1rem">
              <FormLabel>Fingerprint (Optional)</FormLabel>
              <Flex gap="0.4rem" borderLeft="3px solid #534949" padding="0.5rem" alignItems="flex-start">
                <InfoIcon />
                <Text fontStyle="italic">Ensure a DigitalPersona scanning device is connected to your PC if scanning.</Text>
              </Flex>
              {deviceConnected && <Text>NB: Fingerprint scanner is connected</Text>}
              <Box
                overflow="hidden"
                shadow="xs"
                h={240}
                w={240}
                margin="1rem auto"
                border="1px solid rgba(0, 0, 0, 0.04)"
              >
                {fingerprints.newFingerprint && <Image src={getFingerprintImgString(fingerprints.newFingerprint)} />}
              </Box>
            </FormControl>
            <Button
              w="100%"
              type="submit"
              bg="var(--bg-primary)"
              color="white"
              marginTop="3rem"
              _hover={{ background: 'var(--bg-primary-light)' }}
              disabled={isLoading}
            >
              {isLoading ? 'Marking student...' : 'Mark student'}
            </Button>
          </form>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default MarkAttendance;