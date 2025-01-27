import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

export function getEpochsDates(
  fromDate: Date,
  lastEpoch: number,
  epochLimit: number = 7
) {
  dayjs.extend(utc);
  let startDate = dayjs(fromDate).utc().startOf('day');
  const epochsDates = [];
  let currentEpoch = lastEpoch;
  while (currentEpoch > lastEpoch - epochLimit) {
    epochsDates.push({
      number: currentEpoch,
      to: startDate.toDate(),
      from: startDate.subtract(28, 'day').startOf('day').toDate(),
    });
    startDate = startDate.subtract(29, 'day').endOf('day');
    currentEpoch--;
  }

  return epochsDates;
}
