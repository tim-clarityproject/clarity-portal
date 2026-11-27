import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import { Button, MoreLink, PageOpening } from '../../components/design';
import HowItWorksBody from '../../components/howItWorks/HowItWorks';
import { AuthContext } from '../../context/AuthContext';
import { HOW_IT_WORKS_BUTTONS, HOW_IT_WORKS_LINE, HOW_IT_WORKS_TITLE } from '../../content/howItWorks';
import LinkFrame from '../agreementLink/LinkFrame';
import '../hubs/clientPage.css';

// How it works (Draft 9; Stage D item 8): the 25 Nov page opening (the Nekst title and one grey line), the five
// sections with the cycle under the second, "Private by default", and one main button at the foot.

function Opening() {
  return <PageOpening title={HOW_IT_WORKS_TITLE} line={HOW_IT_WORKS_LINE} />;
}

function Foot({ which }) {
  const navigate = useNavigate();
  const b = HOW_IT_WORKS_BUTTONS[which];
  return (
    <div className="hiw-foot">
      <Button variant="primary" onClick={() => navigate(b.to)}>{b.label}</Button>
    </div>
  );
}

/**
 * The public page, /how-it-works: no account needed, in the outside pages' frame (the brand line at the top), light
 * or dark from the device like the outside Health Check (colourMode/boot.js). "Create my free account" opens sign-up;
 * someone already signed in on this device is offered their plan instead.
 */
export function HowItWorksPublic() {
  const auth = useContext(AuthContext);
  return (
    <LinkFrame>
      <div className="hiw-page hiw-page--public">
        <Opening />
        <HowItWorksBody />
        <Foot which={auth?.user ? 'inside' : 'public'} />
      </div>
    </LinkFrame>
  );
}

/** Inside the portal, /about/how-it-works (from My Account's About): the same words, with "Open my plan". */
export function HowItWorksInside() {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="cp-page hiw-page">
        <div className="cp-back"><MoreLink back onClick={() => navigate('/about')}>Back to About</MoreLink></div>
        <Opening />
        <HowItWorksBody />
        <Foot which="inside" />
      </div>
    </div>
  );
}
